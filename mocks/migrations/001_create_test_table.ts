export default {
  up: (dbName: string) => `
  CREATE TABLE ${dbName}.table_test_name (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`,
  down: (dbName: string) => `
  DROP TABLE ${dbName}.table_test_name;
`,
};
