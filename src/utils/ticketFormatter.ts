export function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

export function formatLeadsMention(leadIds: string[]): string {
  if (leadIds.length === 0) {
    return "No leads are currently assigned to this department yet — a wider team member will pick this up.";
  }
  return `Current leads for this department: ${leadIds.map((id) => `<@${id}>`).join(", ")}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "user";
}

export function buildChannelName(channelPrefix: string, username: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slugify(channelPrefix)}-${slugify(username)}-${suffix}`.slice(0, 90);
}
