const dns = require("node:dns");
const net = require("node:net");
const { domainToASCII } = require("node:url");

// MX lookup shows whether a domain looks able to receive mail.
// It does not prove that a specific mailbox exists.
const REQUIRED_MESSAGE = "Email is required.";
const FORMAT_MESSAGE = "Enter a valid email address, like name@example.com.";
const DNS_BUDGET_MS = 5000;
const MAX_EMAIL_LENGTH = 320;

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LETTER_TLD = /^[a-z]{2,}$/;
const PUNYCODE_TLD = /^xn--[a-z0-9-]{2,}$/;

class EmailValidationError extends Error {
    constructor(message, { statusCode = 400, code = "invalid_email" } = {}) {
        super(message);
        this.name = "EmailValidationError";
        this.statusCode = statusCode;
        this.code = code;
    }
}

function defaultDnsClient() {
    return {
        resolveMx: (hostname) => dns.promises.resolveMx(hostname),
        resolve4: (hostname) => dns.promises.resolve4(hostname),
        resolve6: (hostname) => dns.promises.resolve6(hostname)
    };
}

function temporaryDnsError() {
    return new EmailValidationError(
        "We couldn't check this email domain right now. Please try again in a moment.",
        { statusCode: 503, code: "email_check_unavailable" }
    );
}

function formatError() {
    return new EmailValidationError(FORMAT_MESSAGE, {
        statusCode: 400,
        code: "invalid_email"
    });
}

function isDnsHostname(hostname) {
    if (typeof hostname !== "string" || hostname.length === 0 || hostname.length > 253) {
        return false;
    }

    const labels = hostname.split(".");
    if (labels.length < 2) {
        return false;
    }

    if (!labels.every((label) => DNS_LABEL.test(label))) {
        return false;
    }

    const tld = labels[labels.length - 1];
    return LETTER_TLD.test(tld) || PUNYCODE_TLD.test(tld);
}

function toAsciiDomain(domain) {
    if (
        typeof domain !== "string" ||
        domain.length === 0 ||
        domain.length > 253 ||
        domain.includes("..") ||
        domain.startsWith(".") ||
        domain.endsWith(".") ||
        /[\s@_]/.test(domain)
    ) {
        return null;
    }

    let ascii;
    try {
        ascii = domainToASCII(domain);
    } catch (error) {
        return null;
    }

    if (!ascii) {
        return null;
    }

    ascii = ascii.toLowerCase();
    if (!isDnsHostname(ascii) || net.isIP(ascii)) {
        return null;
    }

    return ascii;
}

function isValidLocalPart(local) {
    return typeof local === "string" && local.length <= 64 && LOCAL_PART.test(local);
}

// Trims the address and lowercases the domain. The local part keeps its case.
function normalizeRegistrationEmail(rawEmail) {
    if (typeof rawEmail !== "string") {
        throw formatError();
    }

    const trimmed = rawEmail.trim();
    if (!trimmed) {
        throw new EmailValidationError(REQUIRED_MESSAGE, {
            statusCode: 400,
            code: "invalid_email"
        });
    }

    if (trimmed.length > MAX_EMAIL_LENGTH) {
        throw formatError();
    }

    const at = trimmed.indexOf("@");
    if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
        throw formatError();
    }

    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1).toLowerCase();
    const asciiDomain = toAsciiDomain(domain);
    if (!isValidLocalPart(local) || !asciiDomain) {
        throw formatError();
    }

    return {
        email: `${local}@${asciiDomain}`,
        asciiDomain
    };
}

function isAcceptableEmailFormat(rawEmail) {
    try {
        normalizeRegistrationEmail(rawEmail);
        return true;
    } catch (error) {
        return false;
    }
}

function classifyMx(records) {
    if (!Array.isArray(records) || records.length === 0) {
        return "none";
    }

    let real = 0;
    let nullMx = 0;
    for (const record of records) {
        if (!record || typeof record.exchange !== "string") {
            continue;
        }

        let exchange = record.exchange.trim().toLowerCase();
        if (exchange.endsWith(".")) {
            exchange = exchange.slice(0, -1);
        }

        if (!exchange) {
            nullMx += 1;
        } else {
            real += 1;
        }
    }

    if (real > 0) {
        return "ok";
    }
    if (nullMx > 0) {
        return "null";
    }
    return "none";
}

async function lookup(method, hostname, deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        const error = new Error("DNS lookup timed out");
        error.code = "ETIMEOUT";
        throw error;
    }

    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error("DNS lookup timed out");
            error.code = "ETIMEOUT";
            reject(error);
        }, remaining);
        if (typeof timer.unref === "function") {
            timer.unref();
        }
    });

    try {
        return await Promise.race([
            Promise.resolve().then(() => method(hostname)),
            timeout
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function logTemporary(domain, error) {
    const code = error && error.code ? error.code : "unknown";
    console.error(`Email domain check unavailable for ${domain}: ${code}`);
}

async function addressLookup(method, domain, deadline) {
    try {
        const records = await lookup(method, domain, deadline);
        return Array.isArray(records) && records.length > 0 ? "found" : "missing";
    } catch (error) {
        const code = error && error.code;
        if (code === "ENODATA" || code === "ENOTFOUND") {
            return "missing";
        }
        logTemporary(domain, error);
        return "temporary";
    }
}

// RFC 5321: a domain with no MX records can still receive mail at its A/AAAA address.
async function hasImplicitMx(domain, dnsClient, deadline) {
    const ipv4 = await addressLookup((host) => dnsClient.resolve4(host), domain, deadline);
    if (ipv4 === "found") {
        return true;
    }
    if (ipv4 === "temporary") {
        throw temporaryDnsError();
    }

    const ipv6 = await addressLookup((host) => dnsClient.resolve6(host), domain, deadline);
    if (ipv6 === "found") {
        return true;
    }
    if (ipv6 === "temporary") {
        throw temporaryDnsError();
    }

    return false;
}

async function assertDomainCanReceiveMail(asciiDomain, dnsClient = defaultDnsClient()) {
    if (!isDnsHostname(asciiDomain) || net.isIP(asciiDomain)) {
        throw formatError();
    }

    const deadline = Date.now() + DNS_BUDGET_MS;
    let classification;

    try {
        const records = await lookup((host) => dnsClient.resolveMx(host), asciiDomain, deadline);
        classification = classifyMx(records);
    } catch (error) {
        const code = error && error.code;
        if (code === "ENODATA") {
            classification = "none";
        } else if (code === "ENOTFOUND") {
            throw new EmailValidationError(
                "This email domain doesn't exist. Check the address and try again.",
                { statusCode: 400, code: "email_domain_not_found" }
            );
        } else if (code === "EBADNAME" || code === "EINVAL") {
            throw formatError();
        } else {
            logTemporary(asciiDomain, error);
            throw temporaryDnsError();
        }
    }

    if (classification === "ok") {
        return;
    }

    if (classification === "null") {
        throw new EmailValidationError(
            "This email domain is not set up to receive email.",
            { statusCode: 400, code: "email_domain_no_mail" }
        );
    }

    const implicit = await hasImplicitMx(asciiDomain, dnsClient, deadline);
    if (!implicit) {
        throw new EmailValidationError(
            "This email domain can't receive email. Check the address and try again.",
            { statusCode: 400, code: "email_domain_no_mail" }
        );
    }
}

async function validateRegistrationEmail(rawEmail, dnsClient = defaultDnsClient()) {
    const normalized = normalizeRegistrationEmail(rawEmail);
    await assertDomainCanReceiveMail(normalized.asciiDomain, dnsClient);
    return normalized.email;
}

module.exports = {
    DNS_BUDGET_MS,
    EmailValidationError,
    FORMAT_MESSAGE,
    REQUIRED_MESSAGE,
    assertDomainCanReceiveMail,
    isAcceptableEmailFormat,
    normalizeRegistrationEmail,
    validateRegistrationEmail
};
