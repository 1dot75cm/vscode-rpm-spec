'use strict';

import * as cp from 'child_process';
import * as rl from 'readline';
import * as vscode from 'vscode';

const MODE = {
    language: 'rpm-spec',
    scheme: 'file'
};

const SEVERITY = {
    W: vscode.DiagnosticSeverity.Warning,
    E: vscode.DiagnosticSeverity.Error
};

let diagnostics: vscode.DiagnosticCollection;

interface RPMLintContext {
    path: string,
    options: cp.SpawnOptions,
}

function checkSanity(ctx: RPMLintContext) {
    return new Promise((resolve) => {
        cp.spawn(ctx.path, ['--help'], ctx.options)
            .on('exit', resolve)
            .on('error', (error) => {
                vscode.window.showWarningMessage('rpmlint cannot be launched: ' + error);
            });
    });
}

function lint(ctx: RPMLintContext, document: vscode.TextDocument) {
    if (document.languageId != MODE.language) {
        return;
    }

    const filePath = vscode.workspace.asRelativePath(document.uri.fsPath)

    let linter = cp.spawn(ctx.path, [filePath], ctx.options);
    let reader = rl.createInterface({ input: linter.stdout });
    let array: vscode.Diagnostic[] = [];

    const escapedFilePath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const diagnosticPattern = new RegExp(`^${escapedFilePath}:(?:(?<line>\\d+):)?\\s*(?<severity>\\S)+:\\s*(?<body>.+)$`);

    reader.on('line', (line: string) => {
        const match = diagnosticPattern.exec(line);

        if (match !== null) {
            const diagnosticRange: vscode.Range = (match.groups.line === undefined)
                ? new vscode.Range(0, 0, 0, 0)
                : document.lineAt(Number(match.groups.line) - 1).range;

            let diagnostic = new vscode.Diagnostic(
                diagnosticRange, match.groups.body, SEVERITY[match.groups.severity]);

            array.push(diagnostic);
        }
    });

    reader.on('close', () => {
        diagnostics.set(document.uri, array);
    });
}

export function activate(context: vscode.ExtensionContext) {
    const linterContext: RPMLintContext = {
        path: vscode.workspace.getConfiguration().get('rpmspec.rpmlintPath'),
        options: {
            env: {
                'LANG': 'C',
                'PATH': process.env['PATH']
            },
            cwd: vscode.workspace.rootPath,
        }
    };

    checkSanity(linterContext).then((exitCode) => {
        if (!exitCode && vscode.workspace.getConfiguration().get('rpmspec.lint')) {
            diagnostics = vscode.languages.createDiagnosticCollection();

            vscode.workspace.onDidOpenTextDocument(doc => lint(linterContext, doc));
            vscode.workspace.onDidSaveTextDocument(doc => lint(linterContext, doc));
            vscode.workspace.textDocuments.forEach(doc => lint(linterContext, doc));
            vscode.workspace.onDidCloseTextDocument((document) => {
                diagnostics.delete(document.uri);
            });

            context.subscriptions.push(diagnostics);
        }
    });
}

export function deactivate() { }