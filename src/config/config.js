export const config = {
    cors: {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    },
    
    api: {
        openai: {
            baseUrl: 'https://api.openai.com/v1',
            assistants: {
                'anamnese': 'asst_qHfCO37giEaJzEDLIFPDxZX4',
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