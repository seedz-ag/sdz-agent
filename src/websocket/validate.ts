import Ajv from "ajv";

export default function validate(entities: any[], schema: any) {
  const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
  const validate = ajv.compile(schema);
  for (const entity of entities) {
    const valid = validate(entity);
    if (!valid) {
      console.log(validate.errors);
    }
  }
}

(async () => {
  validate([{ id: {}, name: 1, age: 2 }], {
    additionalProperties: true,
    properties: {
      id: { type: ["string", "integer"] },
      name: { type: "string" },
      age: { type: "integer" },
    },
    required: ["id", "cnpjOrigemDados"],
    type: "object",
  });
})();
