import { type DefaultTheme, defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

/**
 * Where the site is served. GitHub Pages serves a project site under the repository name, so the
 * path is the base of every link; a custom domain sets DOCS_SITE_URL to its root.
 */
const SITE_URL = new URL(process.env.DOCS_SITE_URL ?? "https://openapi-typesafe.github.io/openapi-typesafe/");
const REPOSITORY_URL = "https://github.com/openapi-typesafe/openapi-typesafe";

const sidebar: DefaultTheme.Sidebar = [
  {
    text: "openapi-typesafe",
    items: [
      { text: "Introduction", link: "/introduction" },
      { text: "CLI", link: "/cli" },
      { text: "Node.js API", link: "/node" },
      { text: "Examples", link: "/examples" },
      { text: "Advanced", link: "/advanced" },
    ],
  },
  {
    text: "Moving to openapi-typesafe",
    items: [
      { text: "Migration guide", link: "/migration-guide" },
      { text: "TypeScript 7", link: "/typescript-7" },
      { text: "Compatibility report", link: "/compatibility" },
    ],
  },
  {
    text: "openapi-typesafe-fetch",
    base: "/fetch",
    items: [
      { text: "Getting Started", link: "/" },
      { text: "Middleware & Auth", link: "/middleware-auth" },
      { text: "Testing", link: "/testing" },
      { text: "Examples", link: "/examples" },
      { text: "API", link: "/api" },
    ],
  },
  {
    text: "openapi-typesafe-react-query",
    base: "/react-query",
    items: [
      { text: "Getting Started", link: "/" },
      { text: "useQuery", link: "/use-query" },
      { text: "useMutation", link: "/use-mutation" },
      { text: "useSuspenseQuery", link: "/use-suspense-query" },
      { text: "useInfiniteQuery", link: "/use-infinite-query" },
      { text: "queryOptions", link: "/query-options" },
    ],
  },
  {
    text: "Project",
    items: [
      { text: "About", link: "/about" },
      { text: "Threat model", link: "/security/threat-model" },
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "openapi-typesafe",
  description: "OpenAPI 3.x to TypeScript types, and a type-safe fetch client",
  base: SITE_URL.pathname,
  cleanUrls: true,
  srcExclude: ["README.md", "CONTRIBUTING.md"],
  head: [["link", { rel: "icon", href: `${SITE_URL.pathname}favicon.svg`, type: "image/svg+xml" }]],
  sitemap: { hostname: SITE_URL.href },
  themeConfig: {
    outline: "deep",
    search: { provider: "local" },
    sidebar,
    socialLinks: [{ icon: "github", link: REPOSITORY_URL }],
    editLink: {
      pattern: `${REPOSITORY_URL}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message: `Released under the <a href="${REPOSITORY_URL}/blob/main/LICENSE">MIT License</a>. Built on openapi-typescript, openapi-fetch and openapi-react-query.`,
    },
  } satisfies DefaultTheme.Config,
  vite: {
    // `llms.txt` (an index for language models, https://llmstxt.org), `llms-full.txt` (every page
    // in one file) and a Markdown copy of each page, all at the site root.
    plugins: [
      llmstxt({
        domain: SITE_URL.origin,
        ignoreFiles: ["README.md", "CONTRIBUTING.md"],
        details: [
          "Four packages share one version: `openapi-typesafe` (generator: CLI and Node API),",
          "`openapi-typesafe-fetch` (client), `openapi-typesafe-react-query` (TanStack Query hooks)",
          "and `openapi-typesafe-helpers` (utility types). Coding agents can also load the agent",
          `skill: ${REPOSITORY_URL}/tree/main/skills/openapi-typesafe`,
        ].join(" "),
      }),
    ],
  },
  transformPageData({ relativePath, frontmatter }) {
    const path = relativePath.replace(/(index\.md|\.md)$/, "");
    frontmatter.head ??= [];
    frontmatter.head.push(["link", { rel: "canonical", href: new URL(path, SITE_URL).href }]);
  },
});
