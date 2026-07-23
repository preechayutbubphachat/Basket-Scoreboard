import { describe, expect, it } from "vitest";
import {
  assignmentRoleAllowsPermission,
  defaultAssignmentRoleForSystemRole,
  matchCommandPermissions,
  permissionsForSystemRole
} from "../../apps/api/src/auth/operatorPermissionPolicy";

describe("operator permission policy", () => {
  it("maps every command family to one granular permission", () => {
    expect(matchCommandPermissions).toEqual({
      score: "match.score.operate",
      foul: "match.foul.operate",
      gameClock: "match.clock.game.operate",
      shotClock: "match.clock.shot.operate",
      timeout: "match.timeout.operate",
      lifecycle: "match.lifecycle.operate"
    });
  });
  it("gives ADMIN every granular operator permission", () => {
    expect(permissionsForSystemRole("ADMIN")).toEqual(expect.arrayContaining([
      "match.score.operate",
      "match.foul.operate",
      "match.clock.game.operate",
      "match.clock.shot.operate",
      "match.timeout.operate",
      "match.lifecycle.operate"
    ]));
  });

  it("keeps scorer authority separate from timeout and lifecycle authority", () => {
    expect(assignmentRoleAllowsPermission("SCORER", "match.score.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("SCORER", "match.foul.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("SCORER", "match.timeout.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("SCORER", "match.lifecycle.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("ASSISTANT_SCORER", "match.foul.operate")).toBe(true);
  });

  it("isolates game-clock and shot-clock assignment authority", () => {
    expect(assignmentRoleAllowsPermission("TIMER", "match.clock.game.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("TIMER", "match.clock.shot.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("TIMER", "match.score.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("SHOT_CLOCK_OPERATOR", "match.clock.shot.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("SHOT_CLOCK_OPERATOR", "match.clock.game.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("SHOT_CLOCK_OPERATOR", "match.score.operate")).toBe(false);
  });

  it("uses MATCH_OPERATOR as the narrow timeout and lifecycle owner", () => {
    expect(assignmentRoleAllowsPermission("MATCH_OPERATOR", "match.timeout.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("MATCH_OPERATOR", "match.lifecycle.operate")).toBe(true);
    expect(assignmentRoleAllowsPermission("TIMER", "match.timeout.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("REFEREE", "match.lifecycle.operate")).toBe(false);
  });

  it("keeps correction assignment permissions independent", () => {
    expect(assignmentRoleAllowsPermission("REFEREE", "match.correction.request")).toBe(true);
    expect(assignmentRoleAllowsPermission("REFEREE", "match.correction.apply")).toBe(true);
    expect(assignmentRoleAllowsPermission("REFEREE", "match.correction.reject")).toBe(true);
    expect(assignmentRoleAllowsPermission("TIMER", "match.correction.request")).toBe(false);
  });

  it("denies unknown assignment roles and unrelated permissions by default", () => {
    expect(assignmentRoleAllowsPermission("UNKNOWN", "match.score.operate")).toBe(false);
    expect(assignmentRoleAllowsPermission("SCORER", "match.audit.read")).toBe(false);
  });

  it("keeps dev authentication on the same deny-by-default assignment policy", () => {
    expect(defaultAssignmentRoleForSystemRole("SCORER")).toBe("SCORER");
    expect(defaultAssignmentRoleForSystemRole("REFEREE")).toBe("REFEREE");
    expect(defaultAssignmentRoleForSystemRole("VIEWER")).toBeNull();
    expect(defaultAssignmentRoleForSystemRole("ADMIN")).toBeNull();
  });
});
