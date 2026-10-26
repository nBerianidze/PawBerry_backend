const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    EmailValidationError,
    FORMAT_MESSAGE,
    REQUIRED_MESSAGE,
    isAcceptableEmailFormat,
    normalizeRegistrationEmail,
    validateRegistrationEmail
} = require("../utils/emailValidation");

function dnsError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function fakeDns(handlers = {}) {
    const calls = [];
    const client = {
        calls,
        async resolveMx(domain) {
            calls.push(["mx", domain]);
            if (handlers.mx) return handlers.mx(domain);
            return [{ exchange: "mail.example.com", priority: 10 }];
        },
        async resolve4(domain) {
            calls.push(["a", domain]);
            if (handlers.a) return handlers.a(domain);
            throw dnsError("ENODATA");
        },
        async resolve6(domain) {
            calls.push(["aaaa", domain]);
            if (handlers.aaaa) return handlers.aaaa(domain);
            throw dnsError("ENODATA");
        }
    };
    return client;
}

describe("email format", () => {
    it("trims whitespace and lowercases only the domain", () => {
        const normalized = normalizeRegistrationEmail("  User@Example.COM  ");
        assert.equal(normalized.email, "User@example.com");
        assert.equal(normalized.asciiDomain, "example.com");
        assert.equal(isAcceptableEmailFormat("  User@Example.COM  "), true);
        assert.equal(isAcceptableEmailFormat("not-an-email"), false);
    });

    it("converts international domains to punycode before lookup", () => {
        const normalized = normalizeRegistrationEmail("User@Bücher.DE");
        assert.equal(normalized.email, "User@xn--bcher-kva.de");
        assert.equal(normalized.asciiDomain, "xn--bcher-kva.de");
    });

    it("accepts a normal address when the domain has MX records", async () => {
        const dns = fakeDns();
        const email = await validateRegistrationEmail("ada@example.com", dns);
        assert.equal(email, "ada@example.com");
        assert.deepEqual(dns.calls, [["mx", "example.com"]]);
    });

    it("rejects empty, incomplete, and malformed addresses without DNS lookups", async () => {
        const samples = [
            ["", REQUIRED_MESSAGE],
            ["   ", REQUIRED_MESSAGE],
            ["userexample.com", FORMAT_MESSAGE],
            ["@example.com", FORMAT_MESSAGE],
            ["user@", FORMAT_MESSAGE],
            ["user@@example.com", FORMAT_MESSAGE],
            ["user@example", FORMAT_MESSAGE],
            ["user@.example.com", FORMAT_MESSAGE],
            ["user@example..com", FORMAT_MESSAGE],
            ["user@-example.com", FORMAT_MESSAGE],
            ["user@example-.com", FORMAT_MESSAGE],
            ["user@example.c", FORMAT_MESSAGE],
            ["user@1.2.3.4", FORMAT_MESSAGE],
            ["user name@example.com", FORMAT_MESSAGE],
            [".user@example.com", FORMAT_MESSAGE],
            ["user.@example.com", FORMAT_MESSAGE],
            ["user..name@example.com", FORMAT_MESSAGE],
            ["user@exam_ple.com", FORMAT_MESSAGE],
            [`${"a".repeat(65)}@example.com`, FORMAT_MESSAGE],
            ["user@example.com\u0000.evil.com", FORMAT_MESSAGE]
        ];

        for (const [email, message] of samples) {
            const dns = fakeDns({
                mx() {
                    throw new Error("DNS should not be called");
                }
            });
            await assert.rejects(
                () => validateRegistrationEmail(email, dns),
                (error) => {
                    assert.ok(error instanceof EmailValidationError);
                    assert.equal(error.statusCode, 400);
                    assert.equal(error.code, "invalid_email");
                    assert.equal(error.message, message);
                    return true;
                }
            );
            assert.equal(dns.calls.length, 0, email);
        }
    });
});

describe("MX and address records", () => {
    it("accepts a trailing-dot exchange from the resolver", async () => {
        const dns = fakeDns({
            mx: async () => [{ exchange: "mail.example.com.", priority: 1 }]
        });
        const email = await validateRegistrationEmail("ada@example.com", dns);
        assert.equal(email, "ada@example.com");
    });

    it("accepts a domain with no MX when an A record exists", async () => {
        const dns = fakeDns({
            mx: async () => {
                throw dnsError("ENODATA");
            },
            a: async () => ["203.0.113.10"]
        });
        const email = await validateRegistrationEmail("ada@example.com", dns);
        assert.equal(email, "ada@example.com");
        assert.deepEqual(dns.calls.map((call) => call[0]), ["mx", "a"]);
    });

    it("accepts a domain with no MX when only an AAAA record exists", async () => {
        const dns = fakeDns({
            mx: async () => {
                throw dnsError("ENODATA");
            },
            a: async () => {
                throw dnsError("ENODATA");
            },
            aaaa: async () => ["2001:db8::1"]
        });
        const email = await validateRegistrationEmail("ada@example.com", dns);
        assert.equal(email, "ada@example.com");
        assert.deepEqual(dns.calls.map((call) => call[0]), ["mx", "a", "aaaa"]);
    });

    it("rejects a domain with no MX and no address records", async () => {
        const dns = fakeDns({
            mx: async () => {
                throw dnsError("ENODATA");
            }
        });
        await assert.rejects(
            () => validateRegistrationEmail("ada@example.com", dns),
            (error) => {
                assert.equal(error.statusCode, 400);
                assert.equal(error.code, "email_domain_no_mail");
                assert.match(error.message, /can't receive email/i);
                return true;
            }
        );
    });

    it("rejects a null MX without treating it as a temporary failure", async () => {
        const dns = fakeDns({
            mx: async () => [{ exchange: ".", priority: 0 }]
        });
        await assert.rejects(
            () => validateRegistrationEmail("ada@example.com", dns),
            (error) => {
                assert.equal(error.statusCode, 400);
                assert.equal(error.code, "email_domain_no_mail");
                return true;
            }
        );
        assert.deepEqual(dns.calls.map((call) => call[0]), ["mx"]);
    });

    it("rejects a domain that does not exist", async () => {
        const dns = fakeDns({
            mx: async () => {
                throw dnsError("ENOTFOUND");
            }
        });
        await assert.rejects(
            () => validateRegistrationEmail("ada@missing.example", dns),
            (error) => {
                assert.equal(error.statusCode, 400);
                assert.equal(error.code, "email_domain_not_found");
                assert.match(error.message, /doesn't exist/i);
                assert.doesNotMatch(error.message, /invalid email address/i);
                return true;
            }
        );
        assert.deepEqual(dns.calls, [["mx", "missing.example"]]);
    });
});

describe("temporary DNS failures", () => {
    for (const code of ["ETIMEOUT", "ETIMEDOUT", "ESERVFAIL", "EAI_AGAIN", "ECONNREFUSED"]) {
        it(`does not treat ${code} as proof that the address is invalid`, async () => {
            const dns = fakeDns({
                mx: async () => {
                    throw dnsError(code);
                }
            });
            await assert.rejects(
                () => validateRegistrationEmail("ada@example.com", dns),
                (error) => {
                    assert.ok(error instanceof EmailValidationError);
                    assert.equal(error.statusCode, 503);
                    assert.equal(error.code, "email_check_unavailable");
                    assert.match(error.message, /try again/i);
                    assert.doesNotMatch(error.message, /invalid/i);
                    return true;
                }
            );
            assert.deepEqual(dns.calls.map((call) => call[0]), ["mx"]);
        });
    }

    it("returns unavailable when the address fallback times out", async () => {
        const dns = fakeDns({
            mx: async () => {
                throw dnsError("ENODATA");
            },
            a: async () => {
                throw dnsError("ETIMEOUT");
            }
        });
        await assert.rejects(
            () => validateRegistrationEmail("ada@example.com", dns),
            (error) => {
                assert.equal(error.statusCode, 503);
                assert.equal(error.code, "email_check_unavailable");
                assert.doesNotMatch(error.message, /invalid/i);
                return true;
            }
        );
        assert.deepEqual(dns.calls.map((call) => call[0]), ["mx", "a"]);
    });
});
