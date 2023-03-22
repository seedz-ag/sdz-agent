import AWS, { AWSError } from 'aws-sdk'
import { ICloudStorage } from '../interfaces/cloud-storage.interface'
import { PromiseResult } from 'aws-sdk/lib/request'

export const S3Adapter = (context: any): ICloudStorage => {
  const S3 = new AWS.S3()
  return {
    list: async (
      path: string
    ): Promise<PromiseResult<AWS.S3.ListObjectsOutput, AWSError>> => {
      const [bucket, ...prefix] = path.split('/')
      return S3.listObjects({
        Bucket: bucket,
        Prefix: prefix.join('/'),
      }).promise()
    },
    read: async (
      path: string
    ): Promise<string> => {
      const [bucket, ...prefix] = path.split('/')
      return String((await S3.getObject({
        Bucket: bucket,
        Key: prefix.join('/'),
      }).promise()).Body?.toString())
    },
    rename: async (Bucket: string, Path: string): Promise<boolean> => {
      const Key = Path.split('/')
      const Filename = Key.pop()
      return await S3.copyObject({
        Bucket,
        CopySource: encodeURI(`${Bucket}/${Key.join('/')}/${Filename}`),
        Key: encodeURI(`${Key.join('/')}/processed/*${Filename}`),
      })
        .promise()
        .then(async () => {
          // Delete the old object
          await S3.deleteObject({
            Bucket,
            Key: `${Key.join('/')}/${Filename}`,
          }).promise()
          return true
        })
        // Error handling is left up to reader
        .catch((e) => {
          console.error(e)
          return false
        })
    },
  }
}
