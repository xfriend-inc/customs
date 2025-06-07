import { describe, it, beforeEach, mock } from "node:test";
import assert from "assert";
import { Migrator } from "../src/migrator";
import path from "path";

describe("Migrator", async () => {
  let mockClient: any;
  let mockResult: any[];
  let captureQueries: any[];
  let migrator: Migrator;
  const dbName = "db_test_name";
  const tableName = "migration";
  const migrationDir = path.resolve("./mocks/migrations");

  beforeEach(() => {
    captureQueries = [];
    mockResult = [];
    mockClient = {
      exec: mock.fn((sql: string, params: any[]) => {
        captureQueries.push({ sql, params });
        return {
          rows: mockResult,
        };
      }),
    };
    migrator = new Migrator(mockClient as any, dbName, migrationDir, tableName);
  });

  it("should be instantiable", () => {
    assert.notStrictEqual(migrator, undefined);
  });
  describe("UP", () => {
    it("should create migrations table if not exists on up", async () => {
      await migrator.up();
      const expected: { params: any[] | undefined; sql: string }[] = [
        {
          params: undefined,
          sql: "\n      CREATE TABLE IF NOT EXISTS db_test_name.migration (\n        id SERIAL PRIMARY KEY,\n        name TEXT UNIQUE NOT NULL,\n        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n      );\n    ",
        },
        {
          params: undefined,
          sql: "SELECT name FROM db_test_name.migration",
        },
        {
          params: undefined,
          sql: "\n  CREATE TABLE db_test_name.table_test_name (\n    id UUID PRIMARY KEY,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n  );\n",
        },
        {
          params: ["001_create_test_table.ts"],
          sql: "INSERT INTO db_test_name.migration(name) VALUES ($1)",
        },
      ];

      for (let i = 0; i < expected.length; i++) {
        assert.strictEqual(captureQueries[i].sql, expected[i].sql);
        assert.deepStrictEqual(captureQueries[i].params, expected[i].params);
      }
    });
  });
  describe("DOWN", () => {
    it("should drop migrations table if exists on down", async () => {
      mockResult = [{ name: "001_create_test_table.ts" }];
      await migrator.down();
      const expected = [
        {
          sql: "SELECT name FROM db_test_name.migration ORDER BY executed_at DESC LIMIT 1",
          params: undefined,
        },
        {
          sql: "\n  DROP TABLE db_test_name.table_test_name;\n",
          params: undefined,
        },
        {
          sql: "DELETE FROM db_test_name.migration WHERE name = $1",
          params: ["001_create_test_table.ts"],
        },
      ];

      for (let i = 0; i < expected.length; i++) {
        assert.strictEqual(captureQueries[i].sql, expected[i].sql);
      }
    });
  });
});
