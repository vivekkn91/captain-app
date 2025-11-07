const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add network security configuration for cleartext traffic
 * This allows HTTP connections to local IP addresses (192.168.x.x, 10.x.x.x, etc.)
 */
const withNetworkSecurityConfig = (config) => {
  // First, modify the AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    if (!manifest.application) {
      return config;
    }

    const application = manifest.application[0];
    
    // Set usesCleartextTraffic to true
    application.$['android:usesCleartextTraffic'] = 'true';
    
    // Set networkSecurityConfig
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return config;
  });

  // Then, create the network security config file
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      
      // Ensure directory exists
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      const networkSecurityConfigContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext (HTTP) traffic for all connections -->
    <!-- This is necessary for connecting to local development servers via IP address -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

      const configFilePath = path.join(xmlDir, 'network_security_config.xml');
      fs.writeFileSync(configFilePath, networkSecurityConfigContent, 'utf8');

      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;

