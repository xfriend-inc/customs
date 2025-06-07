import fs from "node:fs/promises";
import path from "path";
import { pathToFileURL } from "url";

/**
 * @author Ediberto B-O
 * @license MIT
 * @description A simple database migration tool for applying and rolling back migrations.
 *
 * Represents a database migration with methods to apply (`up`) or revert (`down`) changes.
 *
 * @interface Migration
 * @property up - A function that takes a database name and returns a string representing the migration to apply.
 * @property down - A function that takes a database name and returns a string representing the migration to revert.
 */
export interface Migration {
  up: (dbName: string) => string;
  down: (dbName: string) => string;
}

/**
 * Handles database schema migrations by applying and rolling back migration scripts.
 *
 * The `Migrator` class manages a migrations table in the target database, loads migration files
 * from a specified directory, and applies or rolls back migrations as needed. Migration files
 * must export `up` and `down` functions for schema changes.
 *
 * @example
 * ```typescript
 * const migrator = new Migrator(db, "mydb", "./migrations");
 * await migrator.up();   // Applies all pending migrations
 * await migrator.down(); // Rolls back the last applied migration
 * ```
 *
 * @remarks
 * - Migration files must be `.ts` or `.js` files exporting `up` and `down` functions.
 * - The migrations table tracks which migrations have been applied.
 * - The `db` object must provide an `exec` method for executing SQL queries.
 *
 * @param db - Database connection object with an `exec` method.
 * @param dbName - Name of the target database/schema.
 * @param migrationDir - Directory containing migration files.
 * @param tableName - Name of the migrations tracking table (default: "migrations").
 */
export class Migrator {
  constructor(
    private db: { exec: (sql: string, params?: any[]) => Promise<any> },
    private dbName: string,
    private migrationDir: string,
    private tableName = "migrations"
  ) {}

  /**
   * Ensures that the migrations table exists in the database.
   *
   * This method creates a table with the specified name in the current database if it does not already exist.
   * The table includes the following columns:
   * - `id`: A unique serial primary key for each migration.
   * - `name`: The unique name of the migration (not nullable).
   * - `executed_at`: The timestamp when the migration was executed, defaulting to the current timestamp.
   *
   * @returns A promise that resolves when the table has been created or already exists.
   * @throws Will propagate any database errors encountered during table creation.
   */
  private async ensureMigrationsTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.dbName}.${this.tableName} (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Retrieves the set of migration names that have already been applied.
   *
   * Executes a SQL query to select the `name` column from the migrations table,
   * and returns a `Set` containing the names of all applied migrations.
   *
   * @returns A promise that resolves to a `Set` of applied migration names.
   */
  private async getAppliedMigrations(): Promise<Set<string>> {
    const result = await this.db.exec(
      `SELECT name FROM ${this.dbName}.${this.tableName}`
    );
    return new Set(result.rows.map((row: { name: string }) => row.name));
  }

  /**
   * Loads migration files from the specified migration directory.
   *
   * This method reads all `.ts` and `.js` files in the migration directory,
   * dynamically imports each file, and checks if the imported module exports
   * both `up` and `down` functions. If so, it adds the migration to the result list.
   *
   * @returns A promise that resolves to an array of objects, each containing the file name
   *          and the corresponding migration object with `up` and `down` methods.
   */
  private async loadMigrations(): Promise<
    { file: string; migration: Migration }[]
  > {
    const files = (await fs.readdir(this.migrationDir)).filter(
      (f) => f.endsWith(".js") || f.endsWith(".ts")
    );
    const migrations = [];
    for (const file of files) {
      const fullPath = path.resolve(this.migrationDir, file);
      let mod;
      try {
        // Ensure the file exists and is a .js file for import
        mod = await require(fullPath);
      } catch (err) {
        console.log(`❌ Failed to import migration file: ${fullPath}`, err);
        continue;
      }
      const migration = mod.default ?? mod;
      if (
        typeof migration.up === "function" &&
        typeof migration.down === "function"
      ) {
        migrations.push({
          file,
          migration: { up: migration.up, down: migration.down },
        });
      }
    }
    return migrations;
  }

  /**
   * Applies all pending database migrations.
   *
   * This method ensures the migrations table exists, retrieves the list of already applied migrations,
   * loads all available migration scripts, and applies any that have not yet been run.
   * For each unapplied migration, it executes the migration's `up` SQL statements and records
   * the migration as applied in the migrations table.
   *
   * @returns {Promise<void>} A promise that resolves when all pending migrations have been applied.
   */
  public async up(): Promise<void> {
    await this.ensureMigrationsTable();
    const applied = await this.getAppliedMigrations();
    const migrations = await this.loadMigrations();

    for (const { file, migration } of migrations) {
      if (applied.has(file)) continue;
      const sql = await migration.up(this.dbName);
      await this.db.exec(sql);
      await this.db.exec(
        `INSERT INTO ${this.dbName}.${this.tableName}(name) VALUES ($1)`,
        [file]
      );
      console.log(`✅ Applied: ${file}`);
    }
  }

  /**
   * Rolls back the most recently executed migration.
   *
   * This method retrieves the latest migration entry from the migrations table,
   * finds the corresponding migration script, and executes its `down` SQL to revert the changes.
   * After successful rollback, it removes the migration entry from the migrations table.
   * If there are no migrations to rollback, it logs a warning message.
   *
   * @returns {Promise<void>} A promise that resolves when the rollback is complete.
   * @throws {Error} If the migration file corresponding to the latest entry is not found.
   */
  public async down(): Promise<void> {
    const result = await this.db.exec(
      `SELECT name FROM ${this.dbName}.${this.tableName} ORDER BY executed_at DESC LIMIT 1`
    );
    const last = result.rows[0]?.name;
    if (!last) return console.log("⚠️ No migrations to rollback.");

    const migrations = await this.loadMigrations();
    const target = migrations.find((m) => m.file === last);
    if (!target) throw new Error(`Migration not found: ${last}`);

    const sql = target.migration.down(this.dbName);
    await this.db.exec(sql);
    await this.db.exec(
      `DELETE FROM ${this.dbName}.${this.tableName} WHERE name = $1`,
      [last]
    );
    console.log(`⏪ Rolled back: ${last}`);
  }
}
