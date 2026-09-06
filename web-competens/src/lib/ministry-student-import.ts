import * as XLSX from "xlsx";
import type { Classe, Level, StudentImportRow } from "@/types";

type Cell = string | number | boolean | Date | null | undefined;

export interface MinistryImportPreview {
  levelName: string;
  className: string;
  rows: StudentImportRow[];
}

function cellText(value: Cell): string {
  return value == null ? "" : String(value).trim();
}

function normalized(value: Cell): string {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: Cell): string {
  return normalized(value).replace(/\s/g, "");
}

function levelInitials(value: Cell): string {
  return normalized(value).split(" ").map((part) => part[0] ?? "").join("");
}

function findMetadataValue(grid: Cell[][], label: "niveau" | "classe"): string {
  for (const row of grid) {
    const index = row.findIndex((cell) => normalized(cell) === label);
    if (index === -1) continue;
    for (let column = index + 1; column < row.length; column += 1) {
      const value = cellText(row[column]);
      if (value) return value;
    }
  }
  return "";
}

function findColumnIndex(headers: Cell[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(normalized(header)));
}

function parseDate(raw: Cell): string {
  if (!raw) return "";
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const value = cellText(raw);
  const ymd = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function matchesLevel(level: Level, ministryLevel: string): boolean {
  const expected = compact(ministryLevel);
  return compact(level.name) === expected
    || compact(level.code) === expected
    || compact(level.code) === levelInitials(ministryLevel);
}

export function parseMinistryStudentImport(
  worksheet: XLSX.WorkSheet,
  classes: Classe[],
  levels: Level[],
): MinistryImportPreview {
  const grid = XLSX.utils.sheet_to_json<Cell[]>(worksheet, { header: 1, defval: null, raw: true });
  const levelName = findMetadataValue(grid, "niveau");
  const className = findMetadataValue(grid, "classe");
  if (!levelName || !className) {
    throw new Error("Le fichier doit contenir les informations Niveau et Classe.");
  }

  const headerRowIndex = grid.findIndex((row) =>
    findColumnIndex(row, ["code"]) !== -1
    && findColumnIndex(row, ["nom"]) !== -1
    && findColumnIndex(row, ["prenom"]) !== -1,
  );
  if (headerRowIndex === -1) {
    throw new Error("Le tableau des élèves (Code, Nom, Prénom) est introuvable.");
  }

  const headers = grid[headerRowIndex];
  const codeIndex = findColumnIndex(headers, ["code"]);
  const lastNameIndex = findColumnIndex(headers, ["nom"]);
  const firstNameIndex = findColumnIndex(headers, ["prenom"]);
  const genderIndex = findColumnIndex(headers, ["genre", "sexe"]);
  const birthDateIndex = findColumnIndex(headers, ["date de naissance"]);
  if (genderIndex === -1 || birthDateIndex === -1) {
    throw new Error("Les colonnes Genre et Date de naissance sont obligatoires.");
  }

  const matchingClasses = classes.filter((classe) => compact(classe.name) === compact(className));
  const targetClass = matchingClasses.find((classe) => {
    const level = levels.find((item) => item.id === classe.levelId);
    return level ? matchesLevel(level, levelName) : false;
  });
  if (!targetClass) {
    throw new Error(`Aucune classe active ne correspond à « ${className} » au niveau « ${levelName} ».`);
  }

  const rows = grid.slice(headerRowIndex + 1)
    .map((row) => {
      const firstName = cellText(row[firstNameIndex]);
      const lastName = cellText(row[lastNameIndex]);
      const massarCode = cellText(row[codeIndex]);
      const genderValue = normalized(row[genderIndex]);
      return {
        firstName,
        lastName,
        massarCode,
        birthDate: parseDate(row[birthDateIndex]),
        gender: (genderValue.startsWith("f") ? "F" : "M") as "M" | "F",
        classId: targetClass.id,
      };
    })
    .filter((row) => row.firstName && row.lastName && row.massarCode);

  if (rows.length === 0) throw new Error("Aucun élève valide n'a été trouvé dans le fichier.");
  return { levelName, className, rows };
}
