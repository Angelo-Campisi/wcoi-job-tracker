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

/** The company's today, as the database sees it ("YYYY-MM-DD"). */
async function today(): Promise<string> {
  return (await c.query("select private.company_today()::text as d")).rows[0].d;
}

// A tiny valid-looking PNG data URL standing in for a customer's signature.
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const turnInSigned = "select * from public.turn_in_work_order($1, $2, $3, null)";
const turnInNoSignature = "select * from public.turn_in_work_order($1, null, null, $2)";

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
      expect(await expectFailure(c, "select * from public.sign_in_with_pin('111111', 'd', 'ip')")).toMatch(
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
      const day = await today();
      await actAs(c, ids.leadA);
      const [entry] = await rows<{ entered_by: string; version: number }>(newEntry, [
        ids.wo1001, ids.emp(3), day, 6.5,
      ]);
      expect(entry.entered_by).toBe(ids.leadA);
      expect(entry.version).toBe(1);
    }));

  it("a lead cannot claim someone else entered the hours", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      const [entry] = await rows<{ entered_by: string }>(
        `insert into public.time_entries (work_order_id, employee_id, work_date, hours, entered_by)
         values ($1, $2, $3, 4, $4) returning entered_by`,
        [ids.wo1001, ids.emp(3), day, ids.owner],
      );
      expect(entry.entered_by).toBe(ids.leadA);
    }));

  it("a lead cannot add or change hours on another lead's job", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, newEntry, [ids.wo1002, ids.emp(5), day, 2])).toMatch(/row-level security/);
      expect(await count("update public.time_entries set hours = 1 where work_order_id = $1", [ids.wo1002])).toBe(0);
      expect(await count("delete from public.time_entries where work_order_id = $1", [ids.wo1002])).toBe(0);
    }));

  it("hours must be more than 0, at most 24, in half-hour steps", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      for (const bad of [0, -1, 24.5, 2.25]) {
        expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(3), day, bad])).toMatch(
          /check constraint|numeric field overflow/,
        );
      }
      expect(await rows(newEntry, [ids.wo1001, ids.emp(3), day, 24])).toHaveLength(1);
    }));

  it("the same employee cannot be entered twice for one job and day", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      await c.query(newEntry, [ids.wo1001, ids.emp(1), day, 2]);
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(1), day, 2])).toMatch(/duplicate key/);
    }));

  it("each edit raises the version and records who edited", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      const [created] = await rows<{ id: string }>(newEntry, [ids.wo1001, ids.emp(3), day, 8]);
      const [e] = await rows<{ version: number; updated_by: string }>(
        "update public.time_entries set hours = 7 where id = $1 returning version, updated_by",
        [created.id],
      );
      expect(e).toEqual({ version: 2, updated_by: ids.leadA });
    }));

  it("a lead can only enter, change, or remove hours for today", () =>
    inRollback(c, async () => {
      const day = await today();
      const [{ y }] = await rows<{ y: string }>("select ($1::date - 1)::text as y", [day]);
      const pastEntry = "50000000-0000-4000-8000-000000000001"; // 2026-11-02, seed data
      await actAs(c, ids.leadA);
      const todayOnly = /only enter hours for today/;
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(3), y, 4])).toMatch(todayOnly);
      expect(await expectFailure(c, "update public.time_entries set hours = 1 where id = $1", [pastEntry])).toMatch(todayOnly);
      expect(await expectFailure(c, "delete from public.time_entries where id = $1", [pastEntry])).toMatch(todayOnly);
      // Moving today's entry to another day is refused too.
      const [created] = await rows<{ id: string }>(newEntry, [ids.wo1001, ids.emp(3), day, 8]);
      expect(
        await expectFailure(c, "update public.time_entries set work_date = $2 where id = $1", [created.id, y]),
      ).toMatch(todayOnly);
      expect(await count("delete from public.time_entries where id = $1", [created.id])).toBe(1);
    }));

  it("the bookkeeper and owner can change hours on any day", () =>
    inRollback(c, async () => {
      const day = await today();
      const [{ y }] = await rows<{ y: string }>("select ($1::date - 3)::text as y", [day]);
      await actAs(c, ids.bookkeeper);
      expect(await count("update public.time_entries set hours = 6 where id = $1", ["50000000-0000-4000-8000-000000000001"])).toBe(1);
      expect(await rows(newEntry, [ids.wo1001, ids.emp(3), y, 4])).toHaveLength(1);
      await actAs(c, ids.owner);
      expect(await count("delete from public.time_entries where id = $1", ["50000000-0000-4000-8000-000000000002"])).toBe(1);
    }));

  it("the company time zone must be a real one", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(await expectFailure(c, "update public.settings set company_time_zone = 'Mars/Base'")).toMatch(
        /Unknown time zone/,
      );
      expect(await count("update public.settings set company_time_zone = 'America/Denver'")).toBe(1);
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

  it("hours by day across all jobs for a date range, hours only", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const r = await rows<{ employee_id: string; work_date: string; hours: string }>(
        `select employee_id, to_char(work_date, 'YYYY-MM-DD') as work_date, hours
         from public.employee_hours_between($1, '2026-11-02', '2026-11-08') order by 2`,
        [[ids.emp(4)]],
      );
      expect(r.map((x) => [x.work_date, Number(x.hours)])).toEqual([
        ["2026-11-02", 7.5],
        ["2026-11-03", 9],
      ]);
      expect(
        await expectFailure(c, "select * from public.employee_hours_between($1, '2026-01-01', '2026-12-31')", [
          [ids.emp(4)],
        ]),
      ).toMatch(/0 to 62 days/);
      await actAs(c, "anon");
      expect(
        await expectFailure(c, "select * from public.employee_hours_between($1, '2026-11-02', '2026-11-08')", [
          [ids.emp(4)],
        ]),
      ).toMatch(/permission denied/);
    }));
});

describe("crew", () => {
  it("hours can only be entered for someone on the job's crew", () =>
    inRollback(c, async () => {
      const day = await today();
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(5), day, 4])).toMatch(
        /Add this person to the crew/,
      );
      await c.query("insert into public.job_crew (work_order_id, employee_id) values ($1, $2)", [
        ids.wo1001, ids.emp(5),
      ]);
      expect(await rows(newEntry, [ids.wo1001, ids.emp(5), day, 4])).toHaveLength(1);
    }));

  it("a lead can remove a crew member with no hours, but not one with hours", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      await c.query("insert into public.job_crew (work_order_id, employee_id) values ($1, $2)", [
        ids.wo1001, ids.emp(5),
      ]);
      expect(
        await count("delete from public.job_crew where work_order_id = $1 and employee_id = $2", [
          ids.wo1001, ids.emp(5),
        ]),
      ).toBe(1);
      expect(
        await expectFailure(c, "delete from public.job_crew where work_order_id = $1 and employee_id = $2", [
          ids.wo1001, ids.emp(3),
        ]),
      ).toMatch(/Remove their hours first/);
    }));

  it("only active employees can be added to a crew", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      // emp-6 (Test Installer Foxtrot) is inactive.
      expect(
        await expectFailure(c, "insert into public.job_crew (work_order_id, employee_id) values ($1, $2)", [
          ids.wo1001, ids.emp(6),
        ]),
      ).toMatch(/Only active employees/);
    }));

  it("a lead cannot change the crew on another lead's job", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(
        await expectFailure(c, "insert into public.job_crew (work_order_id, employee_id) values ($1, $2)", [
          ids.wo1002, ids.emp(3),
        ]),
      ).toMatch(/row-level security/);
    }));
});

describe("turn-in and locking", () => {
  it("after turn-in the lead cannot edit hours, but the office can, and it is logged", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [wo] = await rows<{ status: string; turned_in_by: string }>(
        "select status, turned_in_by from public.turn_in_work_order($1, 'Sam Placeholder', $2, null)",
        [ids.wo1001, SIGNATURE],
      );
      expect(wo).toEqual({ status: "turned_in", turned_in_by: ids.leadA });

      // Lead is locked out.
      expect(await count("update public.time_entries set hours = 1 where work_order_id = $1", [ids.wo1001])).toBe(0);
      expect(await expectFailure(c, newEntry, [ids.wo1001, ids.emp(3), await today(), 2])).toMatch(
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
      expect(await expectFailure(c, turnInNoSignature, [ids.wo1001, "Customer left"])).toMatch(/Not allowed/);
      await actAs(c, ids.leadA);
      await c.query(turnInNoSignature, [ids.wo1001, "Customer left"]);
      expect(await expectFailure(c, turnInNoSignature, [ids.wo1001, "Again"])).toMatch(/already been turned in/);
    }));

  it("turn-in needs a signature with a name, or a reason there's no signature", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, "select public.turn_in_work_order($1, null, null, null)", [ids.wo1001])).toMatch(
        /signature, or say why/,
      );
      expect(await expectFailure(c, "select public.turn_in_work_order($1, null, null, '  ')", [ids.wo1001])).toMatch(
        /signature, or say why/,
      );
      expect(await expectFailure(c, turnInSigned, [ids.wo1001, " ", SIGNATURE])).toMatch(/name of the person signing/);
      expect(await expectFailure(c, turnInSigned, [ids.wo1001, "Sam", "data:image/jpeg;base64,xx"])).toMatch(
        /could not be read/,
      );
      // Nothing was turned in by the failed tries.
      expect((await rows<{ status: string }>("select status from public.work_orders where id = $1", [ids.wo1001]))[0].status).toBe("open");
    }));

  it("the signature is saved with the turn-in and only seen by people on the job", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [wo] = await rows<{ customer_signed_name: string; turn_in_note: string | null }>(turnInSigned, [
        ids.wo1001, "  Sam Placeholder ", SIGNATURE,
      ]);
      expect(wo).toMatchObject({ customer_signed_name: "Sam Placeholder", turn_in_note: null });
      const [sig] = await rows<{ signed_name: string; captured_by: string }>(
        "select signed_name, captured_by from public.work_order_signatures where work_order_id = $1",
        [ids.wo1001],
      );
      expect(sig).toEqual({ signed_name: "Sam Placeholder", captured_by: ids.leadA });
      await actAs(c, ids.owner);
      expect(await count("select 1 from public.work_order_signatures where work_order_id = $1", [ids.wo1001])).toBe(1);
      await actAs(c, ids.leadB);
      expect(await count("select 1 from public.work_order_signatures where work_order_id = $1", [ids.wo1001])).toBe(0);
    }));

  it("a turn-in without a signature keeps the reason", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const [wo] = await rows<{ customer_signed_name: string | null; turn_in_note: string }>(turnInNoSignature, [
        ids.wo1001, "Customer had left for the day",
      ]);
      expect(wo).toMatchObject({ customer_signed_name: null, turn_in_note: "Customer had left for the day" });
    }));

  it("nobody can write signatures directly, only by turning in", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(
        await expectFailure(
          c,
          "insert into public.work_order_signatures (work_order_id, signed_name, image_png) values ($1, 'X', $2)",
          [ids.wo1002, SIGNATURE],
        ),
      ).toMatch(/permission denied/);
    }));
});

describe("bookkeeper review", () => {
  const approve = "select status, approved_by from public.approve_work_order($1)";
  const pendingCo = "60000000-0000-4000-8000-000000000002";
  const pastEntry = "50000000-0000-4000-8000-000000000003";

  it("only the office approves, only turned-in jobs, and not with a change order waiting", () =>
    inRollback(c, async () => {
      await actAs(c, ids.bookkeeper);
      expect(await expectFailure(c, approve, [ids.wo1001])).toMatch(/still waiting for the owner/);
      await actAs(c, ids.owner);
      await c.query("update public.change_orders set status = 'denied' where id = $1", [pendingCo]);
      await actAs(c, ids.bookkeeper);
      expect(await expectFailure(c, approve, [ids.wo1001])).toMatch(/Only a turned-in job/);

      await actAs(c, ids.leadA);
      await c.query(turnInNoSignature, [ids.wo1001, "Customer left"]);
      expect(await expectFailure(c, approve, [ids.wo1001])).toMatch(/Only the bookkeeper or owner/);

      await actAs(c, ids.bookkeeper);
      expect((await rows(approve, [ids.wo1001]))[0]).toEqual({ status: "approved", approved_by: ids.bookkeeper });
    }));

  it("approved jobs are locked for everyone until the approval is undone", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadB);
      await c.query(turnInNoSignature, [ids.wo1002, "Customer left"]);
      await actAs(c, ids.owner);
      await c.query("select public.approve_work_order($1)", [ids.wo1002]);
      const hourlyEntry = "50000000-0000-4000-8000-000000000006";
      const locked = /has been approved, so it is locked/;
      expect(await expectFailure(c, "update public.time_entries set hours = 5 where id = $1", [hourlyEntry])).toMatch(locked);
      expect(await expectFailure(c, "delete from public.time_entries where id = $1", [hourlyEntry])).toMatch(locked);
      expect(
        await expectFailure(c, "insert into public.change_orders (work_order_id, hours_added, description) values ($1, 2, 'x')", [
          ids.wo1002,
        ]),
      ).toMatch(locked);
      expect(await expectFailure(c, "select public.reopen_work_order($1)", [ids.wo1002])).toMatch(/Undo the approval first/);

      await actAs(c, ids.bookkeeper);
      const [back] = await rows<{ status: string; approved_by: string | null }>(
        "select status, approved_by from public.unapprove_work_order($1)",
        [ids.wo1002],
      );
      expect(back).toEqual({ status: "turned_in", approved_by: null });
      expect(await count("update public.time_entries set hours = 5 where id = $1", [hourlyEntry])).toBe(1);
    }));

  it("reopening sends the job back to the lead and removes the old signature", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      await c.query(turnInSigned, [ids.wo1001, "Sam Placeholder", SIGNATURE]);
      expect(await expectFailure(c, "select public.reopen_work_order($1)", [ids.wo1001])).toMatch(/Only the bookkeeper or owner/);
      await actAs(c, ids.bookkeeper);
      const [wo] = await rows<{ status: string; turned_in_at: string | null; customer_signed_name: string | null }>(
        "select status, turned_in_at, customer_signed_name from public.reopen_work_order($1)",
        [ids.wo1001],
      );
      expect(wo).toEqual({ status: "open", turned_in_at: null, customer_signed_name: null });
      expect(await count("select 1 from public.work_order_signatures where work_order_id = $1", [ids.wo1001])).toBe(0);
      // The lead can work on it again (today's hours).
      const day = await today();
      await actAs(c, ids.leadA);
      expect(await rows(newEntry, [ids.wo1001, ids.emp(3), day, 4])).toHaveLength(1);
      // Past days still go through the office.
      expect(await expectFailure(c, "update public.time_entries set hours = 1 where id = $1", [pastEntry])).toMatch(
        /only enter hours for today/,
      );
    }));

  it("each review step is in the audit log", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadB);
      await c.query(turnInNoSignature, [ids.wo1003, "Customer left"]);
      await actAs(c, ids.bookkeeper);
      await c.query("select public.approve_work_order($1)", [ids.wo1003]);
      const log = await rows<{ status: string; changed_by: string }>(
        `select new_data->>'status' as status, changed_by from public.audit_log
         where table_name = 'work_orders' and record_id = $1 order by id`,
        [ids.wo1003],
      );
      expect(log.slice(-2)).toEqual([
        { status: "turned_in", changed_by: ids.leadB },
        { status: "approved", changed_by: ids.bookkeeper },
      ]);
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

  it("change orders use half-hour steps, at most 500 hours, and need a description", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      const insert = `insert into public.change_orders (work_order_id, hours_added, description) values ($1, $2, $3)`;
      expect(await expectFailure(c, insert, [ids.wo1001, 2.3, "x"])).toMatch(/check constraint/);
      expect(await expectFailure(c, insert, [ids.wo1001, 500.5, "x"])).toMatch(/check constraint/);
      expect(await expectFailure(c, insert, [ids.wo1001, 2, "  "])).toMatch(/check constraint/);
      expect(await expectFailure(c, insert, [ids.wo1001, 2, "x".repeat(1001)])).toMatch(/check constraint/);
      expect(await count(insert, [ids.wo1001, 2.5, "Two more desks"])).toBe(1);
    }));

  it("a lead cannot submit a change order on another lead's job or after turn-in", () =>
    inRollback(c, async () => {
      const insert = `insert into public.change_orders (work_order_id, hours_added, description) values ($1, 2, 'x')`;
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, insert, [ids.wo1002])).toMatch(/row-level security/);
      await c.query(turnInNoSignature, [ids.wo1001, "Customer left"]);
      expect(await expectFailure(c, insert, [ids.wo1001])).toMatch(/row-level security/);
      // The office still can.
      await actAs(c, ids.bookkeeper);
      expect(await count(insert, [ids.wo1001])).toBe(1);
    }));

  it("quick change orders can't be denied, and the owner can deny a large one", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(
        await expectFailure(c, "update public.change_orders set status = 'denied' where id = $1", [
          "60000000-0000-4000-8000-000000000001",
        ]),
      ).toMatch(/approved automatically/);
      const [co] = await rows<{ status: string; decided_by: string }>(
        "update public.change_orders set status = 'denied' where id = $1 returning status, decided_by",
        ["60000000-0000-4000-8000-000000000002"],
      );
      expect(co).toEqual({ status: "denied", decided_by: ids.owner });
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
  const signIn = async (pin: string, device = "tablet-1", ip = "203.0.113.1") =>
    (
      await rows<{ result: string; user_id: string | null }>(
        "select * from public.sign_in_with_pin($1, $2, $3)",
        [pin, device, ip],
      )
    )[0];

  it("a PIN alone says who is signing in", () =>
    inRollback(c, async () => {
      await actAs(c, "service_role");
      expect(await signIn("111111")).toEqual({ result: "ok", user_id: ids.leadA });
      expect(await signIn("888888")).toEqual({ result: "ok", user_id: ids.owner });
      expect(await signIn("123456")).toEqual({ result: "wrong", user_id: null });
      // Not 6 digits: never matches, and counts as a wrong try.
      expect(await signIn("1111")).toEqual({ result: "wrong", user_id: null });
    }));

  it("locks a tablet after 5 wrong PINs, but not other tablets", () =>
    inRollback(c, async () => {
      await actAs(c, "service_role");
      for (let i = 0; i < 4; i++) expect((await signIn("000000", "tablet-1")).result).toBe("wrong");
      expect((await signIn("000000", "tablet-1")).result).toBe("locked");
      // Even the right PIN is refused on that tablet while locked.
      expect((await signIn("111111", "tablet-1")).result).toBe("locked");
      // Another tablet on a different connection still works.
      expect(await signIn("111111", "tablet-2", "198.51.100.7")).toEqual({ result: "ok", user_id: ids.leadA });
    }));

  it("locks an internet address that keeps guessing with new tablet ids", () =>
    inRollback(c, async () => {
      await actAs(c, "service_role");
      for (let i = 0; i < 20; i++) await signIn("000000", `fake-${i}`, "192.0.2.9");
      expect((await signIn("111111", "fresh-id", "192.0.2.9")).result).toBe("locked");
    }));

  it("pauses PIN sign-in everywhere after too many wrong PINs in an hour", () =>
    inRollback(c, async () => {
      await actAs(c, "service_role");
      for (let i = 0; i < 30; i++) await signIn("000000", `d-${i}`, `10.0.0.${i}`);
      expect((await signIn("111111", "new", "10.9.9.9")).result).toBe("paused");
    }));

  it("a turned-off person cannot sign in", () =>
    inRollback(c, async () => {
      await c.query("update public.app_users set active = false where id = $1", [ids.leadB]);
      await actAs(c, "service_role");
      expect(await signIn("222222")).toEqual({ result: "inactive", user_id: null });
    }));

  it("the app (signed-in users) cannot check PINs directly", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(await expectFailure(c, "select * from public.sign_in_with_pin('111111', 'd', 'ip')")).toMatch(
        /permission denied/,
      );
      expect(await expectFailure(c, "select * from private.sign_in_failures")).toMatch(/permission denied/);
    }));

  it("PINs can be set by the office; only the owner sets an owner PIN", () =>
    inRollback(c, async () => {
      await actAs(c, ids.leadA);
      expect(await expectFailure(c, "select public.set_user_pin($1, '432100')", [ids.leadA])).toMatch(
        /Only the bookkeeper or owner/,
      );
      await actAs(c, ids.bookkeeper);
      await c.query("select public.set_user_pin($1, '432100')", [ids.leadA]);
      expect(await expectFailure(c, "select public.set_user_pin($1, '432199')", [ids.owner])).toMatch(
        /Only the owner/,
      );
      expect(await expectFailure(c, "select public.set_user_pin($1, '1234')", [ids.leadA])).toMatch(
        /exactly 6 digits/,
      );
      await actAs(c, "service_role");
      expect(await signIn("432100")).toEqual({ result: "ok", user_id: ids.leadA });
      expect((await signIn("111111", "tablet-9", "198.51.100.1")).result).toBe("wrong");
    }));

  it("no two people can have the same PIN", () =>
    inRollback(c, async () => {
      await actAs(c, ids.owner);
      expect(await expectFailure(c, "select public.set_user_pin($1, '222222')", [ids.leadA])).toMatch(
        /already taken/,
      );
      // Setting your own current PIN again is fine.
      await c.query("select public.set_user_pin($1, '111111')", [ids.leadA]);
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
