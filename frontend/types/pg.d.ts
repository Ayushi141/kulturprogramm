declare module "pg" {
  export class Pool {
    constructor(config: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    });

    query<Row>(sql: string): Promise<{ rows: Row[] }>;
  }
}
