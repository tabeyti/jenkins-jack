let password

const keytar = {
	getPassword: jest.fn(() => password),
	setPassword: jest.fn((_,__,pwd) => {
		password = pwd
	}),
	deletePassword: jest.fn()
};

module.exports = keytar;