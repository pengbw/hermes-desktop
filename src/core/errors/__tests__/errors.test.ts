import { describe, it, expect } from "vitest";
import { AppError } from "../AppError";
import { DatabaseError } from "../DatabaseError";
import { NetworkError } from "../NetworkError";
import { ValidationError } from "../ValidationError";

describe("AppError", () => {
  it("creates with default options", () => {
    const error = new AppError("test error");
    expect(error.message).toBe("test error");
    expect(error.name).toBe("AppError");
    expect(error.category).toBe("app");
    expect(error.code).toBe("UNKNOWN");
    expect(error.timestamp).toBeGreaterThan(0);
  });

  it("creates with custom options", () => {
    const error = new AppError("test", {
      category: "vrm",
      code: "LOAD_FAILED",
      details: { model: "test.vrm" },
    });
    expect(error.category).toBe("vrm");
    expect(error.code).toBe("LOAD_FAILED");
    expect(error.details).toEqual({ model: "test.vrm" });
  });

  it("serializes to JSON", () => {
    const error = new AppError("test", { code: "TEST" });
    const json = error.toJSON();
    expect(json.name).toBe("AppError");
    expect(json.message).toBe("test");
    expect(json.code).toBe("TEST");
    expect(json.timestamp).toBeGreaterThan(0);
  });

  it("is instance of Error", () => {
    const error = new AppError("test");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe("DatabaseError", () => {
  it("creates with database category", () => {
    const error = new DatabaseError("query failed");
    expect(error.name).toBe("DatabaseError");
    expect(error.category).toBe("database");
    expect(error.code).toBe("DB_ERROR");
  });

  it("creates with custom code and details", () => {
    const error = new DatabaseError("unique constraint", {
      code: "UNIQUE_VIOLATION",
      details: { table: "conversations" },
    });
    expect(error.code).toBe("UNIQUE_VIOLATION");
    expect(error.details).toEqual({ table: "conversations" });
  });

  it("is instance of AppError and Error", () => {
    const error = new DatabaseError("test");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(DatabaseError);
  });
});

describe("NetworkError", () => {
  it("creates with network category", () => {
    const error = new NetworkError("connection timeout");
    expect(error.name).toBe("NetworkError");
    expect(error.category).toBe("network");
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("creates with statusCode", () => {
    const error = new NetworkError("not found", { statusCode: 404 });
    expect(error.statusCode).toBe(404);
  });

  it("is instance of AppError and Error", () => {
    const error = new NetworkError("test");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(NetworkError);
  });
});

describe("ValidationError", () => {
  it("creates with validation category", () => {
    const error = new ValidationError("invalid input");
    expect(error.name).toBe("ValidationError");
    expect(error.category).toBe("validation");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toEqual({});
  });

  it("creates with field errors", () => {
    const error = new ValidationError("validation failed", {
      fields: { email: "invalid format", name: "required" },
    });
    expect(error.fields).toEqual({ email: "invalid format", name: "required" });
  });

  it("is instance of AppError and Error", () => {
    const error = new ValidationError("test");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
  });
});
