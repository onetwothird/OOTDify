// C:\OOTDify\plugins\withResizerShaders.js
// react-native-vision-camera-resizer runs a Vulkan compute shader and loads it
// from the APK at `assets/shaders/Resizer.comp.spv`. The library relies on the
// Android Gradle Plugin's built-in shader compilation (`shaders { ... }`),
// which AGP 9 no longer has, so the .spv is never built and the live try-on
// tracker fails with "Failed to open Vulkan shader asset". This plugin adds a
// task to the app's build.gradle that compiles the library's shaders with the
// NDK's glslc and registers the output as a generated assets folder.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @generated ootdify-resizer-shaders";

const GRADLE = `
${MARKER} (plugins/withResizerShaders.js)
abstract class CompileResizerShadersTask extends DefaultTask {
  @InputDirectory abstract DirectoryProperty getSourceDir()
  @InputFile abstract RegularFileProperty getGlslc()
  @OutputDirectory abstract DirectoryProperty getOutputDir()

  @TaskAction
  void compile() {
    def outDir = new File(outputDir.get().asFile, "shaders")
    outDir.deleteDir()
    outDir.mkdirs()
    sourceDir.get().asFile.eachFileMatch(~/.+\\.(comp|vert|frag)$/) { shader ->
      def proc = new ProcessBuilder(glslc.get().asFile.absolutePath, "-O", shader.absolutePath,
          "-o", new File(outDir, "\${shader.name}.spv").absolutePath).redirectErrorStream(true).start()
      def log = proc.inputStream.text
      if (proc.waitFor() != 0) throw new GradleException("glslc failed for \${shader.name}:\\n\${log}")
    }
  }
}

def resizerPackage = new File(["node", "--print", "require.resolve('react-native-vision-camera-resizer/package.json')"]
    .execute(null, rootDir).text.trim())
def compileResizerShaders = tasks.register("compileResizerShaders", CompileResizerShadersTask) {
  def os = System.getProperty("os.name").toLowerCase()
  def host = os.contains("windows") ? "windows-x86_64" : os.contains("mac") ? "darwin-x86_64" : "linux-x86_64"
  sourceDir.set(new File(resizerPackage.parentFile, "android/src/main/shaders"))
  glslc.set(new File(android.ndkDirectory, "shader-tools/\${host}/glslc\${os.contains("windows") ? ".exe" : ""}"))
  outputDir.set(layout.buildDirectory.dir("generated/ootdify/resizerShaders"))
}
androidComponents.onVariants(androidComponents.selector().all()) { variant ->
  variant.sources.assets?.addGeneratedSourceDirectory(compileResizerShaders, { it.outputDir })
}
`;

function withResizerShaders(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error("withResizerShaders: expected a Groovy app/build.gradle");
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += GRADLE;
    }
    return cfg;
  });
}

module.exports = withResizerShaders;
module.exports.GRADLE = GRADLE;
module.exports.MARKER = MARKER;
