"use strict";

module.exports = {
	port: () => process.env.PORT ? Number(process.env.PORT) : null,
	isTestEnv: () => process.env.IS_TEST_ENV == '1' ? true : false,
	isDevEnv: () => process.env.IS_DEV_ENV == '1' ? true : false,
};