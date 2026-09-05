export const installerVersion = "0.6.0";
export const installerStateVersion = 1;
export const knownPathServerName = "knownpath";
export const knownPathSkillName = "knownpath";
export const apiUrlEnvironmentName = "KNOWNPATH_API_URL";
export const apiKeyEnvironmentName = "KNOWNPATH_API_KEY";
export const stdioCommand = "npx";
export const stdioArguments = ["-y", "knownpath", "mcp"] as const;

export function stdioArgumentsForProfile(profileName?: string): readonly string[] {
  return profileName === undefined ? stdioArguments : [...stdioArguments, "--profile", profileName];
}
