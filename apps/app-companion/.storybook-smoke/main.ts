import path from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

const companionRoot = path.resolve(__dirname, "..");
const tokagentRoot = path.resolve(companionRoot, "../..");

const config: StorybookConfig = {
  stories: [
    "../src/components/chat/ChatAvatar.stories.tsx",
    "../src/components/companion/InferenceCloudAlertButton.stories.tsx",
    "../src/components/companion/shell-control-styles.stories.tsx",
  ],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],
  typescript: {
    reactDocgen: false,
  },
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@tokagentos/app-core/styles/styles.css": path.resolve(
        tokagentRoot,
        "packages/app-core/src/styles/styles.css",
      ),
      "@tokagentos/app-core": path.resolve(tokagentRoot, "packages/app-core/src"),
      "@tokagentos/core": path.resolve(tokagentRoot, "packages/typescript/src"),
      "@tokagentos/ui": path.resolve(tokagentRoot, "packages/ui/src"),
    };
    return config;
  },
};

export default config;
