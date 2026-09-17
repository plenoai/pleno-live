const { withPodfile } = require("@expo/config-plugins");

/**
 * Pod の IPHONEOS_DEPLOYMENT_TARGET を引き上げる config plugin。
 *
 * CocoaPods はリソースバンドル等の一部ターゲットの deployment target を
 * Podfile の platform に揃えず podspec の値 (例: RNCAsyncStorage 13.4,
 * ReachabilitySwift 12.0) のままにする。Xcode の最小サポートは 15.0 のため
 * Xcode Cloud の Archive が失敗する。post_install で下限を揃える。
 */
const MIN_DEPLOYMENT_TARGET = "15.1";
const MARKER = "PlenoLive:raise-pod-deployment-target";

const SNIPPET = `  # ${MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if current.nil? || current.to_f < 15.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_DEPLOYMENT_TARGET}'
      end
    end
  end
`;

module.exports = function withIosPodDeploymentTarget(config) {
  return withPodfile(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(post_install do \|installer\|\n)/,
      (match) => `${match}${SNIPPET}`,
    );

    return cfg;
  });
};
