

export const cookies = {
   getOptions: () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,

   }),
   set: (res,name,value,options={}) => {
     res.cookies(name,value, { ...cookies.getOptions(), ...options}) ; 
   },
   clear: (res,name,value,options={}) => {
     res.clearCookies(name, { ...cookies.getOptions(), ...options}) ; 
   },
   get: (req,name) => {
     return req.cookies [name];
   },
};