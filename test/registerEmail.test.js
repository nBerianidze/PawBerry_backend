const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const dns = require("node:dns");

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-only-secret";
}

const User = require("../models/User");
const { register } = require("../controllers/authController");

const originalResolveMx = dns.promises.resolveMx;
const originalResolve4 = dns.promises.resolve4;
const originalResolve6 = dns.promises.resolve6;
const originalFindOne = User.findOne;
const originalCreate = User.create;

const dnsCalls = [];
const created = [];
let mxResult = async () => [{ exchange: "mail.example.com", priority: 10 }];
let findOneResult = async () => null;
let createResult = async (doc) => ({
    _id: "user-id",
    username: doc.username,
    firstName: doc.firstName
});

function dnsError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function validBody(overrides = {}) {
    return {
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
        email: "Ada@Example.com",
        phone: "555",
        dateOfBirth: "2000-01-01",
        password: "secret1",
        ...overrides
    };
}

function invoke(body) {
    return new Promise((resolve, reject) => {
        const response = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                resolve({ status: this.statusCode, body: payload });
            }
        };
        Promise.resolve(register({ body }, response)).catch(reject);
    });
}

describe("registration email checks", { concurrency: 1 }, () => {
    before(() => {
        dns.promises.resolveMx = async (hostname) => {
            dnsCalls.push(["mx", hostname]);
            return mxResult(hostname);
        };
        dns.promises.resolve4 = async (hostname) => {
            dnsCalls.push(["a", hostname]);
            throw dnsError("ENODATA");
        };
        dns.promises.resolve6 = async (hostname) => {
            dnsCalls.push(["aaaa", hostname]);
            throw dnsError("ENODATA");
        };
        User.findOne = async (query) => findOneResult(query);
        User.create = async (doc) => {
            created.push(doc);
            return createResult(doc);
        };
    });

    beforeEach(() => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => [{ exchange: "mail.example.com", priority: 10 }];
        findOneResult = async () => null;
        createResult = async (doc) => ({
            _id: "user-id",
            username: doc.username,
            firstName: doc.firstName
        });
    });

    after(() => {
        dns.promises.resolveMx = originalResolveMx;
        dns.promises.resolve4 = originalResolve4;
        dns.promises.resolve6 = originalResolve6;
        User.findOne = originalFindOne;
        User.create = originalCreate;
    });

    it("creates an account only after format, MX, and duplicate checks pass", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => [{ exchange: "mail.example.com", priority: 10 }];
        findOneResult = async () => null;

        const response = await invoke(validBody({ email: "  User@Example.COM  " }));

        assert.equal(response.status, 201);
        assert.equal(response.body.message, "Registration successful");
        assert.equal(created.length, 1);
        assert.equal(created[0].email, "user@example.com");
        assert.deepEqual(dnsCalls, [["mx", "example.com"]]);
    });

    it("rejects a malformed address before DNS or account creation", async () => {
        dnsCalls.length = 0;
        created.length = 0;

        const response = await invoke(validBody({ email: "not-an-email" }));

        assert.equal(response.status, 400);
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "invalid_email");
        assert.equal(created.length, 0);
        assert.equal(dnsCalls.length, 0);
    });

    it("rejects a domain that does not exist", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => {
            throw dnsError("ENOTFOUND");
        };

        const response = await invoke(validBody({ email: "ada@missing.example" }));

        assert.equal(response.status, 400);
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "email_domain_not_found");
        assert.equal(created.length, 0);
    });

    it("rejects a domain with no MX and no address records", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => {
            throw dnsError("ENODATA");
        };

        const response = await invoke(validBody());

        assert.equal(response.status, 400);
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "email_domain_no_mail");
        assert.equal(created.length, 0);
        assert.deepEqual(dnsCalls.map((call) => call[0]), ["mx", "a", "aaaa"]);
    });

    it("does not treat a DNS timeout as an invalid email", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => {
            throw dnsError("ETIMEOUT");
        };

        const response = await invoke(validBody());

        assert.equal(response.status, 503);
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "email_check_unavailable");
        assert.match(response.body.message, /try again/i);
        assert.doesNotMatch(response.body.message, /invalid/i);
        assert.equal(created.length, 0);
    });

    it("does not treat a temporary resolver failure as an invalid email", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => {
            throw dnsError("ESERVFAIL");
        };

        const response = await invoke(validBody());

        assert.equal(response.status, 503);
        assert.equal(response.body.code, "email_check_unavailable");
        assert.doesNotMatch(response.body.message, /invalid/i);
        assert.equal(created.length, 0);
    });

    it("rejects a duplicate email without creating another account", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => [{ exchange: "mail.example.com", priority: 10 }];
        const queries = [];
        findOneResult = async (query) => {
            queries.push(query);
            if (query.email === "user@example.com") {
                return { _id: "existing" };
            }
            return null;
        };

        const response = await invoke(validBody({ email: "User@Example.com" }));

        assert.equal(response.status, 400);
        assert.equal(response.body.message, "Email already exists");
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "email_taken");
        assert.equal(created.length, 0);
        assert.ok(queries.some((query) => query.email === "user@example.com"));
    });

    it("reports a duplicate key from a concurrent registration", async () => {
        dnsCalls.length = 0;
        created.length = 0;
        mxResult = async () => [{ exchange: "mail.example.com", priority: 10 }];
        findOneResult = async () => null;
        createResult = async () => {
            const error = new Error("duplicate");
            error.code = 11000;
            error.keyPattern = { email: 1 };
            throw error;
        };

        const response = await invoke(validBody());

        assert.equal(response.status, 400);
        assert.equal(response.body.message, "Email already exists");
        assert.equal(response.body.field, "email");
        assert.equal(response.body.code, "email_taken");
    });
});
