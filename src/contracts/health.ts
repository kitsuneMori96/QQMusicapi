/** GET /health */
export interface HealthData {
  status: "ok";
  version: string;
  time: string;
  loggedIn: boolean;
  musicid: string | null;
}
