export interface TestCase {
  classname: string;
  name: string;
  time: number;
  failure?: TestFailure;
  skipped?: boolean;
}

export interface TestFailure {
  message: string;
  type?: string;
  content?: string; // Stack trace or error details
}

export interface TestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  testcases: TestCase[];
}

export interface TestResults {
  name?: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  testsuites: TestSuite[];
}

export interface TestIdentifier {
  suiteName: string;
  classname: string;
  testName: string;
}

export interface TestChange {
  identifier: TestIdentifier;
  testCase: TestCase;
}

export interface TestComparison {
  testsAdded: TestChange[];
  testsRemoved: TestChange[];
  testsBroken: TestChange[]; // Changed from passing to failing
  testsFixed: TestChange[]; // Changed from failing to passing
  deltaTotal: number;
  deltaPassed: number;
  deltaFailed: number;
  deltaSkipped: number;
}

export interface AggregatedTestResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalTime: number;
  passRate: number;
  failedTestCases: Array<{
    suiteName: string;
    testCase: TestCase;
  }>;
  comparison?: TestComparison;
}
