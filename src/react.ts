/**
 * React entry point. Until the SDK component extraction lands (see
 * AGENTS.md "Source of truth"), this entry is a type-only re-export
 * so customers can already import the contract from the public
 * package and the runtime swap is a single `bun add` bump away.
 *
 * Wave 1: extract ElvixProvider + ElvixSignIn from the elvix monorepo.
 * Wave 2: identity components (Avatar, Banner, Username, ...).
 * Wave 3: account lifecycle (Sessions, Export, Deactivate, Leave).
 */
export type * from "./types/index";
