// config/config.js
export const config = {
    cors: {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    },
    
    api: {
        mediswiss: {
            baseUrl: 'https://mediswiss.ai/wp-json/custom/v1',
            endpoints: {
                validateUser: '/validate-user'
            }
        },
        openai: {
            baseUrl: 'https://api.openai.com/v1',
            assistants: {
                'anamnese': 'asst_QoRRQsecxfFS1gqXi3sXvY0W',
                'diagnosis': 'asst_Ij3sCQ2oFQmUSiKYiHQLesVL',
                'treatment': 'asst_fOJd3utMyRemVKNBZC4XDntK'
            }
        }
    },

    jwt: {
        expiryTime: 60 * 60 * 24 // 24 hours
    },

    analysisTypes: ['anamnese', 'diagnosis', 'treatment']
};