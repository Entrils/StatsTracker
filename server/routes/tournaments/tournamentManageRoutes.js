import { registerTournamentAdminRoutes } from "./tournamentAdminRoutes.js";
import { registerTournamentRegistrationRoutes } from "./tournamentRegistrationRoutes.js";
export function registerTournamentManageRoutes(app, ctx) {
  registerTournamentAdminRoutes(app, ctx);
  registerTournamentRegistrationRoutes(app, ctx);
}
