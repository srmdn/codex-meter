import { execFile } from "node:child_process";

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: process.cwd(), timeout: 1000 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function repoBranchLabel(): Promise<string | null> {
  const root = await runGit(["rev-parse", "--show-toplevel"]);
  const branch = await runGit(["branch", "--show-current"]);
  if (!root && !branch) return null;
  const repo = root ? root.split("/").filter(Boolean).at(-1) : "repo";
  return [repo, branch].filter(Boolean).join(" ");
}
