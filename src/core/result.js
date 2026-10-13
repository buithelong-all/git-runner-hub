/**
 * GitRunnerHub Core - Standard Result & Error Contract [GRH-112, GRH-114]
 */

class Result {
  constructor(ok, value = null, error = null, code = null, remediation = null) {
    this.ok = ok;
    this.value = value;
    this.error = error;
    this.code = code;
    this.remediation = remediation;
    this.timestamp = new Date().toISOString();
  }

  static success(value) {
    return new Result(true, value, null, null, null);
  }

  static failure(code, message, remediation = null) {
    return new Result(false, null, message, code, remediation);
  }
}

module.exports = { Result };
