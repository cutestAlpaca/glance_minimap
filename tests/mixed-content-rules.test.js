const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

test('manifest enables a static DNR ruleset for mixed-content upgrades', () => {
  const manifest = readJson('manifest.json');

  assert.ok(
    manifest.permissions.includes('declarativeNetRequest'),
    'declarativeNetRequest permission is required for static request rules',
  );
  assert.deepEqual(manifest.host_permissions, ['http://wx.qlogo.cn/*']);
  assert.deepEqual(manifest.declarative_net_request, {
    rule_resources: [
      {
        id: 'mixed_content_upgrades',
        enabled: true,
        path: 'rules/mixed-content-upgrades.json',
      },
    ],
  });
});

test('mixed-content DNR rule upgrades WeChat avatar images to HTTPS', () => {
  const rules = readJson('rules/mixed-content-upgrades.json');

  assert.deepEqual(rules, [
    {
      id: 1,
      priority: 1,
      action: { type: 'upgradeScheme' },
      condition: {
        urlFilter: '||wx.qlogo.cn/',
        resourceTypes: ['image'],
      },
    },
  ]);
});
