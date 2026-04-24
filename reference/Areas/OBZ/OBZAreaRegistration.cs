using System.Web.Mvc;

namespace HFC_PhoneMVC.Areas.OBZ
{
    public class OBZAreaRegistration : AreaRegistration 
    {
        public override string AreaName 
        {
            get 
            {
                return "OBZ";
            }
        }

        public override void RegisterArea(AreaRegistrationContext context) 
        {
            context.MapRoute(
                "OBZ_default",
                "OBZ/{controller}/{action}/{id}",
                new { action = "Index", id = UrlParameter.Optional }
            );
        }
    }
}