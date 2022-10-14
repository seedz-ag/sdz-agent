import dotenv from 'dotenv'
  
  const consumer = 
  const transport =

  while (let data = await consumer()) {
    await transport(data)
  }
