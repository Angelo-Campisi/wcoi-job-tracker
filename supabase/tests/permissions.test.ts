// Database permission and rule tests (spec sections 4, 10, 11).
// Run with: npm run test:db   (needs TEST_DATABASE_URL; see README).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { actAs, buildTestDatabase, expectFailure, ids, inRollback } from "./db";

const adminUrl = process.env.TEST_DATABASE_URL;
let c: pg.Client;

beforeAll(async () => {
  if (!adminUrl) throw new Error("Set TEST_DATABASE_URL to a throwaway Postgres server (see README).");
  const url = await buildTestDatabase(adminUrl);
  c = new pg.Client({ connectionString: url });
  await c.connect();
}, 60_000);

afterAll(async () => {
  await c?.end();
});

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return (await c.query(sql, params)).rowCount ?? 0;
}

const newEntry = `insert into public.time_entries (work_order_id, employee_id, work_date, hours)
  values ($1, $2, $3, $4) returning *`;

describe("not signed in", () => {
  it("can read nothing", () =>
    inRollback(c, async () => {
      await actAs(c, "anon");
      for (const table of ["employees", "employee_wages", "work_orders", "time_entries", "settings"]) {
        expect(await expectFailure(c, `select * from public.${table}`)).toMatch(/permission denied/);
      }
    }));

  it("cannot call any app function", () =>
    inRollback(c, async () => {
      await actAs(c, "anon");
      expect(await expectFailure(c, "select public.verify_user_pin($1, '1111')", [ids.leadA])).toMatch(
        /permission denied/,
      );
    }));
});

describe("seeing work orders", () => {
  it("a lead sees only their assigned jobs", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const a = await rows<{ id: string }>("select id from public.work_orders order by id");
      expect(a.map((r) => r.id)).toEqual([ids.wo1001]);

      await actAs(c, ids.leadB);
      const b = await rows<{ id: string }>("select id from public.work_orders order by id");
      expect(b.map((r) => r.id)).toEqual([ids.wo1002, ids.wo1003]);
    }));

  it("a lead sees hours, lines, and change orders only for their jobs", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const wos = await rows<{ work_order_id: string }>(
        `select distinct work_order_id from public.time_entries
         union select distinct work_order_id from public.work_order_lines
         union select distinct work_order_id from public.change_orders`,
      );
      expect(wos.map((r) => r.work_order_id)).toEqual([ids.wo1001]);
    }));

  it("bookkeeper and owner see every job", () =>
    inRollback(c, async () => {
      for (const who of [ids.bookkeeper, ids.owner]) {
        await actAs(c, who);
        expect(await count("select 1 from public.work_orders")).toBe(3);
        expect(await count("select 1 from public.time_entries")).toBe(8);
      }
    }));

  it("a lead cannot edit a work order directly", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await count("update public.work_orders set notes = 'x' where id = $1", [ids.wo1001])).toBe(0);
      expect(
        await expectFailure(c, "insert into public.work_orders (order_date) values ('2026-11-10')"),
      ).toMatch(/row-level security/);
    }));
});

describe("wages and secrets", () => {
  it("a lead cannot see any wage", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await count("select 1 from public.employee_wages")).toBe(0);
      expect(
        await expectFailure(
          c,
          "insert into public.employee_wages (employee_id, hourly_wage, effective_from) values ($1, 50, '2026-12-01')",
          [ids.emp(1)],
        ),
      ).toMatch(/row-level security/);
    }));

  it("bookkeeper and owner see wages", () =>
    inRollback(c, async () => {
      await actAs(c, ids.bookkeeper);
      expect(await count("select 1 from public.employee_wages")).toBe(7);
      await actAs(c, ids.owner);
      expect(await count("select 1 from public.employee_wages")).toBe(7);
    }));

  it("nobody can read PIN hashes through the app", () =>
    inRollback(c, async () => {
      for (const who of [ids.leadA, ids.bookkeeper, ids.owner]) {
        await actAs(c, who);
        expect(await expectFailure(c, "select * from public.user_pins")).toMatch(/permission denied/);
      }
    }));

  it("only bookkeeper and owner can read the audit log", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await count("select 1 from public.audit_log")).toBe(0);
      await actAs(c, ids.bookkeeper);
      expect(await count("select 1 from public.audit_log")).toBeGreaterThan(0);
      expect(await expectFailure(c, "delete from public.audit_log")).toMatch(/permission denied/);
    }));
});

describe("entering hours", () => {
  it("a lead adds hours on their own open job, recorded under their name", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [entry] = await rows<{ entered_by: string; version: number }>(newEntry, [
        ids.wo1001, ids.emp(5), "2026-11-04", 6.5,
      ]);
      expect(entry.entered_by).toBe(ids.leadA);
      expect(entry.version).toBe(1);
    }));

  it("a lead cannot claim someone else entered the hours", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [entry] = await rows<{ entered_by: string }>(
        `insert into public.time_entries (work_order_id, employee_id, work_date, hours, entered_by)
         values ($1, $2, '2026-11-04', 4, $3) returning entered_by`,
        [ids.wo1001, ids.emp(5), ids.owner],
      );
      expect(entry.entered_by).toBe(ids.leadA);
    }));

  it("a lead cannot add or change hours on another lead's job", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, newEntry, [ids.wo1002, ids.emp(5), "2026-11-03", 2])).toMatch(
        /row-level security/,
      );
      expect(await count("update public.time_entries set hours = 1 where work_order_id = $1", [ids.wo1002])).toBe(0);
      expect(await count("delete from public.time_entries where work_order_id = $1", [ids.wo1002])).toBe(0);
    }));

  it("hours must be more than 0, at most 24, in half-hour steps", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      for (const bad of [0, -1, 24.5, 2.25]) {
        expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(5), "2026-11-05", bad])).toMatch(
          /check constraint|numeric field overflow/,
        );
      }
      expect(await rows(newEntry, [ids.wo1001, ids.emp(5), "2026-11-05", 24])).toHaveLength(1);
    }));

  it("the same employee cannot be entered twice for one job and day", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(1), "2026-11-02", 2])).toMatch(
        /duplicate key/,
      );
    }));

  it("each edit raises the version and records who edited", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [e] = await rows<{ version: number; updated_by: string }>(
        "update public.time_entries set hours = 7 where id = $1 returning version, updated_by",
        ["50000000-0000-4000-8000-000000000001"],
      );
      expect(e).toEqual({ version: 2, updated_by: ids.leadA });
    }));

  it("daily total across all jobs is available to the lead, hours only", () =>
    inRollback(c, async () => {
      // emp-4 worked 5h on lead A's job and 4h on lead B's job on 2026-11-03.
      await actAs(c, ids.leadA);
      const [r] = await rows<{ hours: string }>(
        "select * from public.employee_day_hours($1, '2026-11-03')",
        [[ids.emp(4)]],
      );
      expect(Number(r.hours)).toBe(9);
    }));
});

describe("turn-in and locking", () => {
  it("after turn-in the lead cannot edit hours, but the office can, and it is logged", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [wo] = await rows<{ status: string; turned_in_by: string }>(
        "select status, turned_in_by from public.turn_in_work_order($1, 'Sam Placeholder')",
        [ids.wo1001],
      );
      expect(wo).toEqual({ status: "turned_in", turned_in_by: ids.leadA });

      // Lead is locked out.
      expect(await count("update public.time_entries set hours = 1 where work_order_id = $1", [ids.wo1001])).toBe(0);
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(5), "2026-11-05", 2])).toMatch(
        /row-level security/,
      );
      expect(
        await expectFailure(c, "insert into public.job_crew (work_order_id, employee_id) values ($1, $2)", [
          ids.wo1001, ids.emp(5),
        ]),
      ).toMatch(/row-level security/);
      // Lead can still see the job.
      expect(await count("select 1 from public.work_orders where id = $1", [ids.wo1001])).toBe(1);

      // Bookkeeper can still edit, and the edit is logged with old and new values.
      await actAs(c, ids.bookkeeper);
      const entryId = "50000000-0000-4000-8000-000000000003";
      expect(await count("update public.time_entries set hours = 8 where id = $1", [entryId])).toBe(1);
      const [log] = await rows<{ changed_by: string; old_hours: string; new_hours: string }>(
        `select changed_by, old_data->>'hours' as old_hours, new_data->>'hours' as new_hours
         from public.audit_log where table_name = 'time_entries' and record_id = $1 and action = 'UPDATE'`,
        [entryId],
      );
      expect(log).toEqual({ changed_by: ids.bookkeeper, old_hours: "7.5", new_hours: "8.0" });
    }));

  it("a job can only be turned in once, and only by its lead or the office", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadB);
      expect(await expectFailure(c, "select public.turn_in_work_order($1)", [ids.wo1001])).toMatch(/Not allowed/);
      await actAs(c, ids.leadA);
      await c.query("select public.turn_in_work_order($1)", [ids.wo1001]);
      expect(await expectFailure(c, "select public.turn_in_work_order($1)", [ids.wo1001])).toMatch(/Only an open/);
    }));
});

describe("change orders", () => {
  it("the database decides quick vs. large from the threshold (4 hours)", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const insert = `insert into public.change_orders (work_order_id, hours_added, description)
        values ($1, $2, 'test') returning type, status, requested_by`;
      expect((await rows(insert, [ids.wo1001, 4]))[0]).toEqual({
        type: "quick", status: "approved", requested_by: ids.leadA,
      });
      expect((await rows(insert, [ids.wo1001, 4.5]))[0]).toEqual({
        type: "large", status: "pending", requested_by: ids.leadA,
      });
    }));

  it("only the owner approves large change orders", () =>
    inRollback(c, async () => {
      const large = "60000000-0000-4000-8000-000000000002";
      const approve = "update public.change_orders set status = 'approved' where id = $1";
      await actAs(c, ids.leadA);
      expect(await count(approve, [large])).toBe(0);
      await actAs(c, ids.bookkeeper);
      expect(await count(approve, [large])).toBe(0);
      await actAs(c, ids.owner);
      expect(await count(approve, [large])).toBe(1);
      const [co] = await rows("select status, decided_by from public.change_orders where id = $1", [large]);
      expect(co).toEqual({ status: "approved", decided_by: ids.owner });
    }));

  it("the hours on a submitted change order cannot be rewritten", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      const [co] = await rows<{ hours_added: string }>(
        "update public.change_orders set hours_added = 99 where id = $1 returning hours_added",
        ["60000000-0000-4000-8000-000000000002"],
      );
      expect(co.hours_added).toBe("10.0");
    }));
});

describe("users and PINs", () => {
  it("checks PINs and locks out after 5 wrong tries", () =>
    inRollback(c, async () => {
      await actAs(c, "service_role");
      const check = async (pin: string) =>
        (await rows<{ r: string }>("select public.verify_user_pin($1, $2) as r", [ids.leadA, pin]))[0].r;
      expect(await check("1111")).toBe("ok");
      for (let i = 0; i < 4; i++) expect(await check("0000")).toBe("wrong");
      expect(await check("0000")).toBe("locked");
      // Even the right PIN is refused while locked.
      expect(await check("1111")).toBe("locked");
    }));

  it("the app (signed-in users) cannot check PINs directly", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(await expectFailure(c, "select public.verify_user_pin($1, '1111')", [ids.leadA])).toMatch(
        /permission denied/,
      );
    }));

  it("PINs can be set by the office; only the owner sets an owner PIN", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, "select public.set_user_pin($1, '4321')", [ids.leadA])).toMatch(
        /Only the bookkeeper or owner/,
      );
      await actAs(c, ids.bookkeeper);
      await c.query("select public.set_user_pin($1, '4321')", [ids.leadA]);
      expect(await expectFailure(c, "select public.set_user_pin($1, '4321')", [ids.owner])).toMatch(
        /Only the owner/,
      );
      expect(await expectFailure(c, "select public.set_user_pin($1, '12')", [ids.leadA])).toMatch(/4 to 8 digits/);
      await actAs(c, "service_role");
      const [r] = await rows("select public.verify_user_pin($1, '4321') as r", [ids.leadA]);
      expect(r).toEqual({ r: "ok" });
    }));

  it("the bookkeeper cannot make anyone an owner", () =>
    inRollback(c, async () => {
      await actAs(c, ids.bookkeeper);
      expect(
        await expectFailure(c, "update public.app_users set role = 'owner' where id = $1", [ids.leadA]),
      ).toMatch(/row-level security/);
      expect(await count("update public.app_users set active = false where id = $1", [ids.owner])).toBe(0);
    }));

  it("a deactivated user sees nothing", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      await c.query("update public.app_users set active = false where id = $1", [ids.leadA]);
      await actAs(c, ids.leadA);
      expect(await count("select 1 from public.work_orders")).toBe(0);
      expect(await count("select 1 from public.employees")).toBe(0);
    }));
});

describe("settings", () => {
  it("everyone signed in reads settings; only the office changes them", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [s] = await rows<{ daily_hours_threshold: string }>("select daily_hours_threshold from public.settings");
      expect(s.daily_hours_threshold).toBe("8.0");
      expect(await count("update public.settings set daily_hours_threshold = 10")).toBe(0);
      await actAs(c, ids.owner);
      expect(await count("update public.settings set daily_hours_threshold = 10")).toBe(1);
    }));

  it("the pay period anchor must be a Monday", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(
        await expectFailure(c, "update public.settings set pay_period_anchor_monday = '2026-01-06'"),
      ).toMatch(/check constraint/);
    }));
});
