// The browser build uses this in place of @supabase/realtime-js (see next.config.mjs). The Supabase client always builds a
// realtime client, but this app never subscribes to live changes, so the real one (about 57 kB of script on every page) is dropped.
// tests/realtime-stub.test.ts fails if an upgrade of supabase-js starts calling something this does not have.
export class RealtimeClient {
  constructor() { this.accessTokenValue = null; }
  setAuth() { return Promise.resolve(); }
  connect() {}
  disconnect() { return Promise.resolve("ok"); }
  getChannels() { return []; }
  removeAllChannels() { return Promise.resolve([]); }
  removeChannel() { return Promise.resolve("ok"); }
  channel() { throw new Error("Realtime is not available in this app"); }
}
