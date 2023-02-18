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

// Request schemas

var FullRequestSchema = {
    type: "object",
    properties: {
        type: {
            type: "string",
            required: true
        },

        body: {
            type: "object",
            required: true
        }
    }
};

var AuthRequestSchema = {
    type: "object",
    properties: {
        authKey: {
            type: "string",
            required: true
        }
    }
};

var LocationRequestSchema = {
    type: "object",
    properties: {
        longitude: {
            type: "number",
            required: true
        },

        latitude: {
            type: "number",
            required: true
        }
    }
};

exports.CreateGroupSchema = CreateGroupSchema;

exports.FullRequestSchema = FullRequestSchema;
exports.AuthRequestSchema = AuthRequestSchema;
exports.LocationRequestSchema = LocationRequestSchema;