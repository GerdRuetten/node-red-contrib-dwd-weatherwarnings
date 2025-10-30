#!/usr/bin/env node
// Failt den Versionsbump, wenn CHANGELOG.md nicht gestaged ist oder leer blieb.

const { execSync } = require('node:child_process');

function run(cmd) {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

try {
    // 1) Prüfen, ob CHANGELOG.md existiert
    try { run('test -f CHANGELOG.md'); } catch {
        console.error('❌ CHANGELOG.md fehlt im Repo.');
        process.exit(1);
    }

    // 2) Ist CHANGELOG.md gestaged?
    const staged = run('git diff --name-only --cached');
    if (!staged.split('\n').includes('CHANGELOG.md')) {
        console.error('❌ CHANGELOG.md ist nicht gestaged. Bitte: git add CHANGELOG.md');
        process.exit(1);
    }

    // 3) Optional: Wurde CHANGELOG.md überhaupt geändert (gegenüber HEAD)?
    const changed = run('git diff --name-only');
    const changedCached = run('git diff --name-only --cached');
    const anyChange = (changed + '\n' + changedCached).split('\n').filter(Boolean);
    const changedChangelog = anyChange.includes('CHANGELOG.md');
    if (!changedChangelog) {
        console.error('❌ CHANGELOG.md wurde nicht geändert. Bitte neue Einträge ergänzen.');
        process.exit(1);
    }

    console.log('✅ CHANGELOG.md ist vorhanden, geändert und gestaged.');
} catch (e) {
    console.error(e.message || e);
    process.exit(1);
}