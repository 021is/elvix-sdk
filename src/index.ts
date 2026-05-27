/**
 * @elvix.is/sdk · top-level barrel.
 *
 * Most callers import from the subpath exports:
 *   - @elvix.is/sdk/react   drop-in React components
 *   - @elvix.is/sdk/server  verifyElvixToken and friends
 *   - @elvix.is/sdk/types   shared TypeScript types
 *   - @elvix.is/sdk/mcp     embeddable MCP server
 *
 * The bare entry re-exports the type-only surface so callers can
 * `import type { ... } from "@elvix.is/sdk"` without dragging in
 * React or MCP code paths.
 */
export type * from "./types/index";
