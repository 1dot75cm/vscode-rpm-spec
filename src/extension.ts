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

function checkSanity() {
    return new Promise((resolve) => {
        cp.spawn('rpmlint', ['--help'])
            .on('exit', resolve)
            .on('error', (error) => {
                vscode.window.showWarningMessage('rpmlint cannot be launched: ' + error);
            });
    });
}

function lint(document: vscode.TextDocument) {
    if (document.languageId != MODE.language) {
        return;
    }

    let linter = cp.spawn('rpmlint', [document.uri.fsPath], { env: { 'LANG': 'C' } });
    let reader = rl.createInterface(linter.stdout, null);
    let array: vscode.Diagnostic[] = [];

    reader.on('line', (line: string) => {
        let match = line.match(new RegExp(`^${document.uri.fsPath}:(\\d+?):\\s*?(\\S)+?:\\s*?(.+)`));

        if (match != null) {
            let diagnostic = new vscode.Diagnostic(document.lineAt(Number(match[1]) - 1).range,
                match[3], SEVERITY[match[2]]);
            array.push(diagnostic);
        }
    });

    reader.on('close', () => {
        diagnostics.set(document.uri, array);
    });
}

export function activate(context: vscode.ExtensionContext) {
    checkSanity().then((exitCode) => {
        if (!exitCode && vscode.workspace.getConfiguration().get('rpmspec.lint')) {
            diagnostics = vscode.languages.createDiagnosticCollection();

            vscode.workspace.onDidOpenTextDocument(lint);
            vscode.workspace.onDidSaveTextDocument(lint);
            vscode.workspace.textDocuments.forEach(lint);
            vscode.workspace.onDidCloseTextDocument((document) => {
                diagnostics.delete(document.uri);
            });

            context.subscriptions.push(diagnostics);
        }
    });
}

export function deactivate() { }