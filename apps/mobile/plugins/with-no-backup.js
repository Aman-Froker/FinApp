// Fin App keeps everything on the phone, so nothing may leave it through Android backup either:
// not the SQLite database, not the scheduled notifications (which carry amounts and payees).
// allowBackup=false stops cloud backup; from Android 12 it does not stop phone-to-phone transfer,
// so these extraction rules exclude every domain from both.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];
const excludeAll = DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n');
const RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${excludeAll}
  </cloud-backup>
  <device-transfer>
${excludeAll}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withNoBackup(config) {
  config = withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'no_backup_rules.xml'), RULES);
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'false';
    app.$['android:dataExtractionRules'] = '@xml/no_backup_rules';
    delete app.$['android:fullBackupContent'];
    return c;
  });
};
