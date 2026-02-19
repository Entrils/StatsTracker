import { registerTeamCoreRoutes } from "./teamCoreRoutes.js";
import { registerTeamInviteRoutes } from "./teamInviteRoutes.js";
export function registerTeamRoutes(app, ctx) {
  registerTeamCoreRoutes(app, ctx);
  registerTeamInviteRoutes(app, ctx);
}
