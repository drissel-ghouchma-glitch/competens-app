import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { Classe, Level } from "@/types";
import { parseMinistryStudentImport } from "./ministry-student-import";

const level: Level = {
  id: "level-2apg",
  name: "2e Annee Primaire General",
  code: "2APG",
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const classe: Classe = {
  id: "class-2apg-1",
  name: "2APG-1",
  levelId: level.id,
  capacity: 30,
  studentCount: 0,
  isArchived: false,
  schoolYearId: "year-2025-2026",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("parseMinistryStudentImport", () => {
  it("extracts Massar codes and assigns every row to the class declared in the ministry sheet", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Académie:", "Souss-Massa"],
      ["Niveau:", "2° Année Primaire Général"],
      ["Classe:", "2APG-1"],
      [],
      ["N.O", "Code", "Nom", "Prénom", "Genre", "Date de naissance", "Lieu naissance"],
      [1, "R215081174", "ARGAM", "Noure", "Fille", "2018/04/11", "AGADIR"],
      [2, "R215081175", "EL FASSI", "Salma", "Garçon", 43283, "AGADIR"],
    ]);

    const result = parseMinistryStudentImport(sheet, [classe], [level]);

    expect(result.levelName).toBe("2° Année Primaire Général");
    expect(result.className).toBe("2APG-1");
    expect(result.rows).toEqual([
      { firstName: "Noure", lastName: "ARGAM", massarCode: "R215081174", birthDate: "2018-04-11", gender: "F", classId: classe.id },
      { firstName: "Salma", lastName: "EL FASSI", massarCode: "R215081175", birthDate: "2018-07-02", gender: "M", classId: classe.id },
    ]);
  });

  it("rejects a file when its class and level do not match an active class", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Niveau:", "3° Année Primaire Général"],
      ["Classe:", "3APG-1"],
      ["Code", "Nom", "Prénom", "Genre", "Date de naissance"],
      ["R215081174", "ARGAM", "Noure", "Fille", "2018/04/11"],
    ]);

    expect(() => parseMinistryStudentImport(sheet, [classe], [level])).toThrow("Aucune classe active");
  });
});
