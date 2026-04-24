using System.Web.Mvc;

namespace HFC_PhoneMVC.Areas.ChooseLib
{
    public class ChooseLibAreaRegistration : AreaRegistration 
    {
        public override string AreaName 
        {
            get 
            {
                return "ChooseLib";
            }
        }

        public override void RegisterArea(AreaRegistrationContext context) 
        {
            context.MapRoute(
                "ChooseLib_default",
                "ChooseLib/{controller}/{action}/{id}",
                new { action = "Index", id = UrlParameter.Optional }
            );
        }
    }
}