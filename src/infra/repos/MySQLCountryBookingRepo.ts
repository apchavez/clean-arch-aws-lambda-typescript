import mysql from "mysql2/promise";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import type { Appointment } from "../../domain/entities/Appointment";
import type { AppointmentRdsRepository } from "./AppointmentRepo";

type Country = "PE" | "CL";
const ssm = new SSMClient({});
let cachedPassword: string | null = null;

async function getPassword(): Promise<string> {
  if (process.env.RDS_PASSWORD && process.env.RDS_PASSWORD.trim() !== "") {
    return process.env.RDS_PASSWORD;
  }
  if (cachedPassword) return cachedPassword;
  const name = process.env.RDS_PASSWORD_SSM;
  if (!name) throw new Error("RDS_PASSWORD_SSM is not defined");
  const out = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  const value = out.Parameter?.Value ?? "";
  if (!value) throw new Error("Could not read SSM password or it is empty");
  cachedPassword = value;
  return cachedPassword;
}

function cfg(country: Country) {
  return {
    host: process.env[country === "PE" ? "RDS_PE_HOST" : "RDS_CL_HOST"]!,
    port: Number(
      process.env[country === "PE" ? "RDS_PE_PORT" : "RDS_CL_PORT"] ?? 3306
    ),
    user: process.env.RDS_USER!,
    database:
      process.env[country === "PE" ? "RDS_PE_DATABASE" : "RDS_CL_DATABASE"]!,
  };
}

const pools: Partial<Record<Country, mysql.Pool>> = {};

async function getPool(country: Country): Promise<mysql.Pool> {
  if (pools[country]) return pools[country];
  const password = await getPassword();
  const { host, port, user, database } = cfg(country);
  console.log(
    `RDS ${country} host=${host} db=${database} user=${user} hasPass=${
      password.length > 0
    }`
  );
  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 2,
  });
  pools[country] = pool;
  return pool;
}

export class AppointmentRdsRepositoryImpl implements AppointmentRdsRepository {
  async writeByCountry(appointment: Appointment): Promise<void> {
    const pool = await getPool(appointment.countryISO as Country);
    const sql = `
      INSERT INTO appointments (appointment_uuid, insured_id, schedule_id, country_iso, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [
      appointment.appointmentUuid,
      appointment.insuredId,
      appointment.scheduleId,
      appointment.countryISO,
      appointment.status,
      appointment.createdAt,
    ]);
  }
}
