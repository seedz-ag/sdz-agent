module.exports = {
  get: jest.fn((url) => {
    return Promise.resolve({
      data: 'data',
    })
  }),
  post: jest.fn((url) => {
    return Promise.resolve({
      data: 'data2',
    })
  }),
  create: jest.fn(function () {
    return this
  }),
}
