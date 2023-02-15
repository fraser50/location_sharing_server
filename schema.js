// This file contains JSON schemas, these schemas are used for validating input from the app

var CreateGroupSchema = {
    type: 'object',
    properties: {
        name: {
            type: "string",
            required: true
        },

        desc: {
            type: "string",
            required: true
        }
    }
};

exports.CreateGroupSchema = CreateGroupSchema;