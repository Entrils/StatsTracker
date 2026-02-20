import { registerTournamentAdminRoutes } from "./tournamentAdminRoutes.js";
import { registerTournamentRegistrationRoutes } from "./tournamentRegistrationRoutes.js";
import { registerTournamentChatRoutes } from "./tournamentChatRoutes.js";
export function registerTournamentManageRoutes(app, ctx) {
  registerTournamentAdminRoutes(app, ctx);
  registerTournamentRegistrationRoutes(app, ctx);
  registerTournamentChatRoutes(app, ctx);
}
