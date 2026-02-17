export default {
  "src/**/*.{js,ts}": (api) =>
    [`pnpm dlx @biomejs/biome format --write ${api.filenames.join(" ")}`, "pnpm run build", "git add dist"],
};
