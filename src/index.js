/**
 * dsh-session-board — host-side entry (node half).
 *
 * The web half of this plugin (src/client/board.js → lib/client.js) is what
 * renders the sidebar board; it is activated by the dsh.client declaration in
 * package.json and needs no node-side wiring. This small host-side layer
 * exists so the bundle is visible in the Cordis tree and to mark the seam
 * where a future host-backed state.json store (atomic write via
 * dsh-atomic-write, served over a Remote namespace) will live.
 *
 * Deliberately dependency-free: link: installs resolve imports from the
 * plugin's real path (outside the profile's node_modules), so the node half
 * must not import anything — not even @deepseek-ai/cordis. The activation
 * lifecycle runs through ctx.effect alone.
 */

export const VERSION = '0.1.0';

/** Cordis fiber dependencies: none — the layer is intentionally standalone. */
export const inject = [];

/** Activation snapshot for diagnostics (read via the logs, or a future service). */
export function describe() {
  return {
    plugin: 'dsh-session-board',
    version: VERSION,
    schema: 1,
    clientPersistence: 'localStorage:dsh.session-board.meta.v1',
    plannedHostStore: '$DSH_HOME/profiles/<profile>/session-board/state.json',
  };
}

/** @param ctx - host plugin context. */
export function apply(ctx) {
  ctx.effect(
    () => {
      console.info('[session-board] host layer active (v' + VERSION + ')');
      return () => {
        console.info('[session-board] host layer deactivated');
      };
    },
    'session-board: host layer lifetime',
  );
}
