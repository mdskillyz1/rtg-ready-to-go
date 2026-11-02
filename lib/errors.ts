export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "AppError"; }
}
export function assertSandbox() {
  if ((process.env.RTG_MODE ?? "sandbox") !== "sandbox" || process.env.VERCEL) {
    throw new AppError(503, "This build only supports a local sandbox. Production authentication, database and private object storage must be implemented and verified before hosting.");
  }
}
