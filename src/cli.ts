import { Migrator } from "./migrator";

export default async function main(
  func: () => { client: any; dbName: string; migrationDir: string }
) {
  return async () => {
    const { client, dbName, migrationDir } = func();
    const migrator = new Migrator(client, dbName, migrationDir);

    const command = process.argv[2];

    if (command === "up") {
      await migrator.up();
    } else if (command === "down") {
      await migrator.down();
    } else {
      console.log('Use "up" or "down" as command');
    }
  };
}
