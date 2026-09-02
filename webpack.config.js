const path = require("path");
const fs = require("fs");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
const { LiveBuildMarkerPlugin, createLiveBuildId } = require("./webpack.live-build-marker");

const extensionVersion = (process.env.npm_package_version || require("./package.json").version).replace("-", ".");
const entries = {
  "zgq-observer": "gauge-content.js",
  "zgq-worker": "gauge-worker.js",
  "zgq-panel": "gauge-panel.js",
};

function loadAnonKey() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("SUPABASE_ANON_KEY="));
  return line ? line.slice("SUPABASE_ANON_KEY=".length).trim() : "";
}

const supabaseAnonKey = loadAnonKey();
if (!supabaseAnonKey) {
  throw new Error(
    "SUPABASE_ANON_KEY must be set at build time; refusing to emit a paid tier that dies offline.",
  );
}

const ignorePatterns = [
  "**/manifest-**",
  "**/dist/**",
  "**/src/**",
  "**/readme.md",
  "**/_locales/**",
  "**/content-style.css",
  "**/popup.css",
  "**/popup.html",
  "**/menu-fixer.js",
  "**/*.js",
  ...Object.values(entries).map((entry) => `**/${entry}`),
];

const manifestTransform = (content, filename) => {
  const filteredContent = content
    .toString()
    .split("\n")
    .filter((str) => !str.trimStart().startsWith("//"))
    .join("\n");

  const manifestData = JSON.parse(filteredContent);
  manifestData.version = extensionVersion;
  return JSON.stringify(manifestData, null, 2);
};

const i18nTransform = (content, filename) => {
  if (!filename.endsWith("messages.json")) return content;

  return content.toString().replace(/__RYD_VERSION__/g, extensionVersion);
};

const listingI18nTransform = (content) => {
  const messages = JSON.parse(content.toString());
  return JSON.stringify(
    {
      extensionName: messages.extensionName,
      extensionDesc: messages.extensionDesc,
    },
    null,
    2,
  );
};

class MirrorJsOutputsPlugin {
  constructor(targetDirs) {
    this.targetDirs = targetDirs;
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise("MirrorJsOutputsPlugin", async () => {
      const { promises: fsp } = fs;
      const outputPath = compiler.options.output.path;
      const entries = await fsp.readdir(outputPath).catch(() => []);
      const jsAssets = entries.filter((name) => name.endsWith(".js"));

      await Promise.all(
        this.targetDirs.map(async (dir) => {
          const targetDir = path.join(outputPath, dir);
          await fsp.mkdir(targetDir, { recursive: true });

          const existingFiles = await fsp.readdir(targetDir).catch(() => []);
          await Promise.all(
            existingFiles
              .filter((file) => jsAssets.includes(file))
              .map((file) => fsp.rm(path.join(targetDir, file), { force: true })),
          );

          await Promise.all(
            jsAssets.map((asset) =>
              fsp.copyFile(path.join(outputPath, asset), path.join(targetDir, path.basename(asset))),
            ),
          );
        }),
      );
    });
  }
}

module.exports = (env = {}, argv = {}) => {
  const liveTestBuild = env.liveTest === true || env.liveTest === "true";
  const liveBuildId = createLiveBuildId(liveTestBuild);

  return {
    entry: Object.fromEntries(
      Object.entries(entries).map(([output, source]) => [output, path.join(__dirname, "./Extensions/combined/", source)]),
    ),
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "Extensions/combined/dist"),
      clean: true,
    },
    cache: false,
    optimization: {
      minimize: false,
    },
    watchOptions: {
      ignored: "**/dist/**",
    },
    plugins: [
      new webpack.DefinePlugin({
        __ZGQ_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
        __RYD_LIVE_BUILD_ID__: JSON.stringify(liveBuildId),
        __RYD_LIVE_TEST_BUILD__: JSON.stringify(liveTestBuild),
      }),
      ...(liveTestBuild
        ? [
            new LiveBuildMarkerPlugin(liveBuildId, [
              "chrome/live-build.json",
            ]),
          ]
        : []),
      // exclude locale files in moment
      new CopyPlugin({
        patterns: [
          {
            from: "./Extensions/combined/manifest-chrome.json",
            to: "./chrome/manifest.json",
            transform: manifestTransform,
          },
          {
            from: "./Extensions/combined/_locales/en/messages.json",
            to: "./chrome/_locales/en/messages.json",
            transform: listingI18nTransform,
          },
          {
            from: "./Extensions/combined/gauge-panel.html",
            to: "./chrome/zgq-panel.html",
          },
          {
            from: "./Extensions/combined/gauge-panel.css",
            to: "./chrome/gauge-panel.css",
          },
          {
            from: "./Extensions/combined/zgq-surface.css",
            to: "./chrome/zgq-surface.css",
          },
          ...[16, 48, 128].map((size) => ({
            from: `./Extensions/combined/icons/gauge${size}.png`,
            to: `./chrome/icons/icon-gauge${size}.png`,
          })),
        ],
      }),
      new MirrorJsOutputsPlugin(["chrome"]),
    ],
    experiments: {
      topLevelAwait: true,
    },
    devtool: argv.mode === "development" ? "inline-source-map" : false,
  };
};
