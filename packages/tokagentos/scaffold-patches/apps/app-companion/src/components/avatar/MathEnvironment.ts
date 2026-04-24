// Tokagent scaffold-patch: upstream `MathEnvironment` replaced with
// AuroraEnvironment. This stub re-exports AuroraEnvironment under both
// names so any upstream code still importing MathEnvironment continues
// to compile without per-file scaffold-patches.
export { AuroraEnvironment, AuroraEnvironment as MathEnvironment } from "./AuroraEnvironment";
